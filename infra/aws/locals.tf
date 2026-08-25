locals {
  name = "cosmic-${var.environment}"
  required_tags = {
    Application = "astroligyapp"
    Environment = var.environment
    ManagedBy   = "opentofu"
    Region      = var.aws_region
    Repository  = "hbkdad/astroligyapp"
  }

  production                              = var.environment == "production"
  app_minimum_count                       = local.production ? 2 : 1
  nat_gateway_count                       = local.production ? 2 : 1
  effective_app_desired_count             = max(var.app_desired_count, local.app_minimum_count)
  feedback_worker_minimum_count           = local.production ? 2 : 1
  effective_feedback_worker_desired_count = max(var.feedback_worker_desired_count, local.feedback_worker_minimum_count)
  backup_retention_days                   = local.production ? max(var.backup_retention_days, 14) : var.backup_retention_days
}

check "task_and_database_capacity" {
  assert {
    condition     = var.app_max_count * 32 + var.feedback_worker_max_count * 4 + var.database_reserved_connections <= var.database_max_connections
    error_message = "application and feedback-worker task maximums exceed the declared PostgreSQL connection budget"
  }
}

check "feedback_worker_desired_count_within_bounds" {
  assert {
    condition     = local.effective_feedback_worker_desired_count <= var.feedback_worker_max_count
    error_message = "effective feedback worker desired count must not exceed feedback_worker_max_count"
  }
}

check "desired_count_within_bounds" {
  assert {
    condition     = local.effective_app_desired_count <= var.app_max_count
    error_message = "effective desired count must not exceed app_max_count"
  }
}
