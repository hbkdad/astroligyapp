variable "name" { type = string }
variable "load_balancer_arn_suffix" { type = string }
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "database_identifier" { type = string }
variable "feedback_queue_name" { type = string }
variable "feedback_dlq_name" { type = string }
variable "tags" { type = map(string) }
