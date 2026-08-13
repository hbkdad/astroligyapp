variable "name" { type = string }
variable "database_arn" { type = string }
variable "kms_key_arn" { type = string }
variable "production" { type = bool }
variable "tags" { type = map(string) }
