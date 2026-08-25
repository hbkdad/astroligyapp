variable "environment" {
  description = "Exact isolated environment name."
  type        = string
  default     = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "aws_region" {
  description = "Approved Canadian deployment region."
  type        = string
  default     = "ca-central-1"
  validation {
    condition     = var.aws_region == "ca-central-1"
    error_message = "aws_region must remain ca-central-1"
  }
}

variable "aws_account_id" {
  description = "Exact isolated AWS account allowed by the provider."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be exactly 12 digits"
  }
}

variable "availability_zones" {
  description = "Two approved Canada Central availability zones."
  type        = list(string)
  validation {
    condition = length(var.availability_zones) == 2 && alltrue([
      for zone in var.availability_zones : startswith(zone, "ca-central-1")
    ])
    error_message = "exactly two ca-central-1 availability zones are required"
  }
}

variable "vpc_cidr" {
  description = "Private RFC1918 VPC CIDR."
  type        = string
  default     = "10.40.0.0/16"
  validation {
    condition     = can(cidrnetmask(var.vpc_cidr)) && startswith(var.vpc_cidr, "10.")
    error_message = "vpc_cidr must be a valid 10.0.0.0/8 private CIDR"
  }
}

variable "image_digest" {
  description = "Immutable ECR image reference including @sha256 digest."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}\\.dkr\\.ecr\\.ca-central-1\\.amazonaws\\.com/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.image_digest))
    error_message = "image_digest must be an immutable ca-central-1 ECR digest"
  }
}

variable "feedback_worker_image_digest" {
  description = "Immutable feedback-worker ECR image reference including @sha256 digest."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}\\.dkr\\.ecr\\.ca-central-1\\.amazonaws\\.com/[a-z0-9._/-]+-feedback-worker@sha256:[a-f0-9]{64}$", var.feedback_worker_image_digest))
    error_message = "feedback_worker_image_digest must be an immutable ca-central-1 feedback-worker ECR digest"
  }
}

variable "application_image_source_revision" {
  description = "Exact 40-character Git revision verified for the application image in the release set."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.application_image_source_revision))
    error_message = "application_image_source_revision must be an exact lowercase Git commit"
  }
}

variable "feedback_worker_image_source_revision" {
  description = "Exact 40-character Git revision verified for the feedback-worker image in the release set."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.feedback_worker_image_source_revision))
    error_message = "feedback_worker_image_source_revision must be an exact lowercase Git commit"
  }
}

variable "release_set_sha256" {
  description = "SHA-256 digest of the verified schema-v2 dual-artifact release set."
  type        = string
  validation {
    condition     = can(regex("^sha256:[a-f0-9]{64}$", var.release_set_sha256))
    error_message = "release_set_sha256 must be an immutable SHA-256 digest"
  }
}

variable "origin_domain_name" {
  description = "Approved origin DNS name covered by the ALB certificate; DNS is managed separately."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.origin_domain_name))
    error_message = "origin_domain_name must be a valid lower-case DNS name"
  }
}

variable "origin_certificate_arn" {
  description = "ca-central-1 ACM certificate ARN for the origin DNS name."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:acm:ca-central-1:[0-9]{12}:certificate/[0-9a-f-]+$", var.origin_certificate_arn))
    error_message = "origin_certificate_arn must be a Canada Central ACM certificate ARN"
  }
}

variable "runtime_secret_arns" {
  description = "Map of runtime environment names to pre-provisioned Secrets Manager ARNs; values are references, never secrets."
  type        = map(string)
  sensitive   = true
  validation {
    condition = length(setsubtract([
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "NEXT_SHARED_CACHE_URL",
      ], keys(var.runtime_secret_arns))) == 0 && alltrue([
      for name, arn in var.runtime_secret_arns :
      can(regex("^[A-Z][A-Z0-9_]+$", name)) && can(regex("^arn:aws:secretsmanager:ca-central-1:${var.aws_account_id}:secret:[A-Za-z0-9/_+=.@-]+$", arn))
    ])
    error_message = "runtime_secret_arns must include the Server Actions and shared-cache settings as exact account-scoped Canada Central secret ARNs"
  }
}

variable "runtime_secret_kms_key_arns" {
  description = "Exact customer-managed KMS key ARNs that protect the referenced runtime secrets; values are references, never keys."
  type        = set(string)
  validation {
    condition = length(var.runtime_secret_kms_key_arns) > 0 && alltrue([
      for arn in var.runtime_secret_kms_key_arns :
      can(regex("^arn:aws:kms:ca-central-1:${var.aws_account_id}:key/[0-9a-f-]+$", arn))
    ])
    error_message = "runtime_secret_kms_key_arns must contain exact account-scoped Canada Central KMS key ARNs"
  }
}

variable "feedback_worker_secret_arns" {
  description = "Exact feedback-worker database URL and HMAC key Secrets Manager ARNs."
  type        = map(string)
  sensitive   = true
  validation {
    condition = length(keys(var.feedback_worker_secret_arns)) == 2 && length(setsubtract(toset(keys(var.feedback_worker_secret_arns)), toset([
      "AUTH_EMAIL_FEEDBACK_DATABASE_URL",
      "AUTH_EMAIL_FEEDBACK_KEYS",
      ]))) == 0 && alltrue([
      for name, arn in var.feedback_worker_secret_arns :
      can(regex("^arn:aws:secretsmanager:ca-central-1:${var.aws_account_id}:secret:[A-Za-z0-9/_+=.@-]+$", arn))
    ])
    error_message = "feedback_worker_secret_arns must contain only the exact database URL and feedback key account-scoped Canada Central secret ARNs"
  }
}

variable "feedback_worker_secret_kms_key_arns" {
  description = "Exact customer-managed KMS keys protecting feedback-worker secrets."
  type        = set(string)
  validation {
    condition = length(var.feedback_worker_secret_kms_key_arns) > 0 && alltrue([
      for arn in var.feedback_worker_secret_kms_key_arns :
      can(regex("^arn:aws:kms:ca-central-1:${var.aws_account_id}:key/[0-9a-f-]+$", arn))
    ])
    error_message = "feedback_worker_secret_kms_key_arns must contain exact account-scoped Canada Central KMS key ARNs"
  }
}

variable "email_identity_domain" {
  description = "Authentication email identity domain; DNS records are applied separately."
  type        = string
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "database_max_connections" {
  type    = number
  default = 100
  validation {
    condition     = var.database_max_connections >= 64 && var.database_max_connections <= 5000
    error_message = "database_max_connections must be between 64 and 5000"
  }
}

variable "app_desired_count" {
  type    = number
  default = 1
  validation {
    condition     = var.app_desired_count >= 1 && var.app_desired_count <= 4
    error_message = "app_desired_count must be between 1 and 4"
  }
}

variable "app_max_count" {
  type    = number
  default = 2
  validation {
    condition     = var.app_max_count >= 2 && var.app_max_count <= 10
    error_message = "app_max_count must be between 2 and 10"
  }
}

variable "feedback_worker_desired_count" {
  type    = number
  default = 1
  validation {
    condition     = var.feedback_worker_desired_count >= 1 && var.feedback_worker_desired_count <= 4
    error_message = "feedback_worker_desired_count must be between 1 and 4; scale-to-zero is intentionally disabled"
  }
}

variable "feedback_worker_max_count" {
  type    = number
  default = 4
  validation {
    condition     = var.feedback_worker_max_count >= 2 && var.feedback_worker_max_count <= 4
    error_message = "feedback_worker_max_count must be between 2 and 4"
  }
}

variable "database_reserved_connections" {
  type    = number
  default = 20
}

variable "log_retention_days" {
  type    = number
  default = 30
  validation {
    condition     = contains([30, 60, 90, 120, 150, 180, 365], var.log_retention_days)
    error_message = "log_retention_days must be an approved bounded CloudWatch retention"
  }
}

variable "backup_retention_days" {
  type    = number
  default = 7
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 7 and 35"
  }
}

variable "waf_rate_limit" {
  type    = number
  default = 1000
  validation {
    condition     = var.waf_rate_limit >= 100 && var.waf_rate_limit <= 20000
    error_message = "waf_rate_limit must be between 100 and 20000 requests per five minutes"
  }
}
