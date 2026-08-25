output "planning_summary" {
  value = {
    environment                  = var.environment
    region                       = var.aws_region
    public_indexing_enabled      = false
    application_minimum          = local.app_minimum_count
    application_maximum          = var.app_max_count
    feedback_worker_minimum      = local.feedback_worker_minimum_count
    feedback_worker_maximum      = var.feedback_worker_max_count
    database_multi_az            = local.production
    database_deletion_guard      = true
    cloudfront_domain            = module.edge.distribution_domain_name
    application_registry_arn     = module.registry.repository_arn
    feedback_worker_registry_arn = module.registry.feedback_worker_repository_arn
    feedback_queue_arn           = module.messaging.feedback_queue_arn
    backup_vault_arn             = module.backup.vault_arn
  }
}

output "security_contract" {
  description = "Non-secret invariants exposed for credential-free plan assertions."
  value = {
    tasks_assign_public_ip                   = module.compute.tasks_assign_public_ip
    readonly_root_filesystem                 = module.compute.readonly_root_filesystem
    feedback_worker_assign_public_ip         = module.compute.feedback_worker_assign_public_ip
    feedback_worker_readonly_root_filesystem = module.compute.feedback_worker_readonly_root_filesystem
    feedback_worker_image_mutability         = module.registry.feedback_worker_image_tag_mutability
    database_publicly_accessible             = module.data.database_publicly_accessible
    database_storage_encrypted               = module.data.database_storage_encrypted
    database_deletion_protection             = module.data.database_deletion_protection
    registry_image_mutability                = module.registry.image_tag_mutability
  }
}
