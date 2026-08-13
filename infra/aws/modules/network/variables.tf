variable "name" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "nat_gateway_count" { type = number }
variable "tags" { type = map(string) }
