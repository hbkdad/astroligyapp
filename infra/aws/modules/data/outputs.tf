output "database_arn" { value = aws_db_instance.postgres.arn }
output "database_identifier" { value = aws_db_instance.postgres.identifier }
output "database_address" { value = aws_db_instance.postgres.address }
output "database_master_secret_arn" {
  value     = try(aws_db_instance.postgres.master_user_secret[0].secret_arn, null)
  sensitive = true
}
output "cache_arn" { value = aws_elasticache_serverless_cache.valkey.arn }
output "cache_endpoint" { value = aws_elasticache_serverless_cache.valkey.endpoint[0].address }
output "data_kms_key_arn" { value = aws_kms_key.data.arn }
output "database_publicly_accessible" { value = aws_db_instance.postgres.publicly_accessible }
output "database_storage_encrypted" { value = aws_db_instance.postgres.storage_encrypted }
output "database_deletion_protection" { value = aws_db_instance.postgres.deletion_protection }
