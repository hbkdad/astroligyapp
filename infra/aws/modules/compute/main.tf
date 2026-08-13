resource "aws_cloudwatch_log_group" "application" {
  name              = "/ecs/${var.name}/application"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
  skip_destroy      = false
  tags              = var.tags
}

resource "aws_kms_key" "logs" {
  description             = "${var.name} application log encryption"
  deletion_window_in_days = var.production ? 30 : 14
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = var.tags
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "execution" {
  statement {
    sid       = "ReadExactRuntimeSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(var.runtime_secret_arns)
  }
  statement {
    sid       = "DecryptRuntimeSecrets"
    actions   = ["kms:Decrypt"]
    resources = var.runtime_secret_kms_key_arns
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution" {
  name   = "exact-runtime-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

resource "aws_lb" "application" {
  name = substr(var.name, 0, 32)
  # trivy:ignore:AWS-0053 -- CloudFront needs a public origin; the ALB security group admits only the AWS-managed CloudFront origin prefix list over TLS.
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.alb_security_group_id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = true
  drop_invalid_header_fields = true
  preserve_host_header       = false
  idle_timeout               = 60
  tags                       = var.tags
}

resource "aws_lb_target_group" "application" {
  name                 = substr("${var.name}-app", 0, 32)
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.aws_subnet.application.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
  tags = var.tags
}

data "aws_subnet" "application" {
  id = var.subnet_ids[0]
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.application.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.origin_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.application.arn
  }
  tags = var.tags
}

resource "aws_ecs_task_definition" "application" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.production ? 1024 : 512
  memory                   = var.production ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "application"
    image                  = var.image_digest
    essential              = true
    readonlyRootFilesystem = true
    portMappings = [{
      name          = "http"
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "PORT", value = "3000" },
      { name = "NEXT_DEPLOYMENT_ID", value = split("@sha256:", var.image_digest)[1] },
      { name = "PUBLIC_SITE_INDEXING_ENABLED", value = "false" },
      { name = "NEXT_SHARED_CACHE_ENABLED", value = "true" },
      { name = "APP_TASK_MAX_COUNT", value = tostring(var.maximum_count) },
      { name = "DATABASE_MAX_CONNECTIONS", value = tostring(var.database_max_connections) },
      { name = "DATABASE_RESERVED_CONNECTIONS", value = tostring(var.database_reserved_connections) }
    ]
    secrets = [for name, arn in var.runtime_secret_arns : {
      name      = name
      valueFrom = arn
    }]
    linuxParameters = { initProcessEnabled = true }
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.application.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "application"
        mode                  = "non-blocking"
        max-buffer-size       = "1m"
      }
    }
    stopTimeout = 30
  }])

  ephemeral_storage { size_in_gib = 21 }
  tags = var.tags
}

resource "aws_ecs_service" "application" {
  name                               = "application"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.application.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  enable_execute_command             = false
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  wait_for_steady_state              = false

  network_configuration {
    assign_public_ip = false
    security_groups  = [var.application_security_group_id]
    subnets          = var.subnet_ids
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.application.arn
    container_name   = "application"
    container_port   = 3000
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count] }
  tags = var.tags

  depends_on = [aws_lb_listener.https]
}

resource "aws_appautoscaling_target" "application" {
  max_capacity       = var.maximum_count
  min_capacity       = var.minimum_count
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.application.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.application.resource_id
  scalable_dimension = aws_appautoscaling_target.application.scalable_dimension
  service_namespace  = aws_appautoscaling_target.application.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
  }
}
