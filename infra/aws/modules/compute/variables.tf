variable "name" { type = string }
variable "aws_region" { type = string }
variable "image_digest" { type = string }
variable "subnet_ids" { type = list(string) }
variable "public_subnet_ids" { type = list(string) }
variable "application_security_group_id" { type = string }
variable "alb_security_group_id" { type = string }
variable "origin_certificate_arn" { type = string }
variable "runtime_secret_arns" {
  type      = map(string)
  sensitive = true
}
variable "runtime_secret_kms_key_arns" { type = set(string) }
variable "desired_count" { type = number }
variable "minimum_count" { type = number }
variable "maximum_count" { type = number }
variable "database_max_connections" { type = number }
variable "database_reserved_connections" { type = number }
variable "log_retention_days" { type = number }
variable "production" { type = bool }
variable "tags" { type = map(string) }
