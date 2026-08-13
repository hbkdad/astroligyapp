resource "aws_db_instance" "public_unprotected" {
  publicly_accessible = true
  storage_encrypted   = false
  deletion_protection = false
  skip_final_snapshot = true
}

resource "aws_ecs_service" "public_task" {
  network_configuration {
    assign_public_ip = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "unrestricted" {
  ip_protocol = "-1"
}

data "aws_iam_policy_document" "wildcard" {
  statement {
    actions   = ["s3:*"]
    resources = ["*"]
  }
}

resource "aws_cloudwatch_log_group" "forever" {
  retention_in_days = 3653
}
