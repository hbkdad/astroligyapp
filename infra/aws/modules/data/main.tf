resource "aws_kms_key" "data" {
  description             = "${var.name} database, cache, and backup encryption"
  deletion_window_in_days = var.production ? 30 : 14
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "data" {
  name          = "alias/${var.name}-data"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-database"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.name}-pg18-"
  family      = "postgres18"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
  parameter {
    name         = "max_connections"
    value        = tostring(var.database_max_connections)
    apply_method = "pending-reboot"
  }
  tags = var.tags
  lifecycle { create_before_destroy = true }
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.name}-postgres"

  engine                        = "postgres"
  engine_version                = "18.4"
  instance_class                = var.database_instance_class
  allocated_storage             = var.production ? 50 : 20
  max_allocated_storage         = var.production ? 500 : 100
  storage_type                  = "gp3"
  storage_encrypted             = true
  kms_key_id                    = aws_kms_key.data.arn
  db_name                       = "cosmic"
  username                      = "cosmic_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.data.arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.database_security_group_id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = false
  port                   = 5432
  multi_az               = var.production

  backup_retention_period   = var.backup_retention_days
  backup_window             = "05:00-06:00"
  maintenance_window        = "sun:07:00-sun:08:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-postgres-final"

  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.data.arn
  monitoring_interval             = 0
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  apply_immediately               = false
  tags                            = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_elasticache_serverless_cache" "valkey" {
  engine                   = "valkey"
  name                     = "${var.name}-cache"
  description              = "Disposable shared Next.js cache and tag coordination"
  kms_key_id               = aws_kms_key.data.arn
  security_group_ids       = [var.cache_security_group_id]
  subnet_ids               = var.subnet_ids
  snapshot_retention_limit = var.production ? 7 : 1
  daily_snapshot_time      = "06:00"

  cache_usage_limits {
    data_storage {
      maximum = var.production ? 10 : 2
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = var.production ? 5000 : 1000
    }
  }
  tags = var.tags
}
