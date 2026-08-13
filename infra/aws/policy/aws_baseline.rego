package aws_baseline

import rego.v1

deny contains message if {
  some name
  configuration := input.resource.aws_db_instance[name][_]
  configuration.publicly_accessible == true
  message := sprintf("RDS instance %s must not be public", [name])
}

deny contains message if {
  some name
  configuration := input.resource.aws_db_instance[name][_]
  configuration.storage_encrypted != true
  message := sprintf("RDS instance %s must be encrypted", [name])
}

deny contains message if {
  some name
  configuration := input.resource.aws_db_instance[name][_]
  configuration.deletion_protection != true
  message := sprintf("RDS instance %s must have deletion protection", [name])
}

deny contains message if {
  some name
  configuration := input.resource.aws_db_instance[name][_]
  configuration.skip_final_snapshot == true
  message := sprintf("RDS instance %s must retain a final snapshot", [name])
}

deny contains message if {
  some name
  configuration := input.resource.aws_ecs_service[name][_]
  configuration.network_configuration[_].assign_public_ip == true
  message := sprintf("ECS service %s must not receive public IPs", [name])
}

deny contains message if {
  some type, name
  startswith(type, "aws_vpc_security_group_")
  configuration := input.resource[type][name][_]
  configuration.ip_protocol == "-1"
  message := sprintf("security-group rule %s.%s must not allow every protocol", [type, name])
}

deny contains message if {
  some name
  configuration := input.data.aws_iam_policy_document[name][_]
  statement := configuration.statement[_]
  statement.resources[_] == "*"
  message := sprintf("IAM policy %s must not contain wildcard resources", [name])
}

deny contains message if {
  some name
  configuration := input.resource.aws_cloudwatch_log_group[name][_]
  is_number(configuration.retention_in_days)
  configuration.retention_in_days > 365
  message := sprintf("log group %s exceeds bounded retention", [name])
}
