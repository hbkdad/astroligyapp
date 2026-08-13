module "network" {
  source             = "./modules/network"
  name               = local.name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  nat_gateway_count  = local.nat_gateway_count
  tags               = local.required_tags
}

module "registry" {
  source = "./modules/registry"
  name   = local.name
  tags   = local.required_tags
}

module "data" {
  source                     = "./modules/data"
  name                       = local.name
  subnet_ids                 = module.network.data_subnet_ids
  database_security_group_id = module.network.database_security_group_id
  cache_security_group_id    = module.network.cache_security_group_id
  database_instance_class    = var.database_instance_class
  database_max_connections   = var.database_max_connections
  backup_retention_days      = local.backup_retention_days
  production                 = local.production
  tags                       = local.required_tags
}

module "messaging" {
  source                = "./modules/messaging"
  name                  = local.name
  email_identity_domain = var.email_identity_domain
  tags                  = local.required_tags
}

module "compute" {
  source                        = "./modules/compute"
  name                          = local.name
  aws_region                    = var.aws_region
  image_digest                  = var.image_digest
  subnet_ids                    = module.network.application_subnet_ids
  public_subnet_ids             = module.network.public_subnet_ids
  application_security_group_id = module.network.application_security_group_id
  alb_security_group_id         = module.network.alb_security_group_id
  origin_certificate_arn        = var.origin_certificate_arn
  runtime_secret_arns           = var.runtime_secret_arns
  runtime_secret_kms_key_arns   = var.runtime_secret_kms_key_arns
  desired_count                 = local.effective_app_desired_count
  minimum_count                 = local.app_minimum_count
  maximum_count                 = var.app_max_count
  database_max_connections      = var.database_max_connections
  database_reserved_connections = var.database_reserved_connections
  log_retention_days            = var.log_retention_days
  production                    = local.production
  tags                          = local.required_tags
}

module "edge" {
  source             = "./modules/edge"
  origin_domain_name = var.origin_domain_name
  name               = local.name
  waf_rate_limit     = var.waf_rate_limit
  tags               = local.required_tags

  providers = { aws = aws.us_east_1 }
}

module "backup" {
  source       = "./modules/backup"
  name         = local.name
  database_arn = module.data.database_arn
  kms_key_arn  = module.data.data_kms_key_arn
  production   = local.production
  tags         = local.required_tags
}

module "observability" {
  source                   = "./modules/observability"
  name                     = local.name
  load_balancer_arn_suffix = module.compute.load_balancer_arn_suffix
  cluster_name             = module.compute.cluster_name
  service_name             = module.compute.service_name
  database_identifier      = module.data.database_identifier
  feedback_queue_name      = module.messaging.feedback_queue_name
  feedback_dlq_name        = module.messaging.feedback_dlq_name
  tags                     = local.required_tags
}
