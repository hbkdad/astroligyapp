mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "aws" {
  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-0123456789abcdef0" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_data "aws_subnet" {
    defaults = { vpc_id = "vpc-0123456789abcdef0" }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock-role"
      id  = "mock-role"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:ca-central-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ca-central-1:123456789012:loadbalancer/app/mock/0123456789abcdef"
      arn_suffix = "app/mock/0123456789abcdef"
      dns_name   = "mock.ca-central-1.elb.amazonaws.com"
      zone_id    = "ZMOCK"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ca-central-1:123456789012:targetgroup/mock/0123456789abcdef" }
  }

  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ca-central-1:123456789012:mock-topic" }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:ca-central-1:123456789012:mock-queue"
      id  = "https://sqs.ca-central-1.amazonaws.com/123456789012/mock-queue"
      url = "https://sqs.ca-central-1.amazonaws.com/123456789012/mock-queue"
    }
  }

  mock_resource "aws_elasticache_serverless_cache" {
    defaults = {
      arn      = "arn:aws:elasticache:ca-central-1:123456789012:serverlesscache:mock-cache"
      endpoint = [{ address = "mock.serverless.cac1.cache.amazonaws.com", port = 6379 }]
    }
  }
}

variables {
  environment                           = "staging"
  aws_account_id                        = "123456789012"
  availability_zones                    = ["ca-central-1a", "ca-central-1b"]
  image_digest                          = "123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  feedback_worker_image_digest          = "123456789012.dkr.ecr.ca-central-1.amazonaws.com/astroligyapp-feedback-worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  application_image_source_revision     = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  feedback_worker_image_source_revision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  release_set_sha256                    = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  origin_domain_name                    = "origin.example.invalid"
  origin_certificate_arn                = "arn:aws:acm:ca-central-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  runtime_secret_arns = {
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/server-actions-AbCdEf"
    NEXT_SHARED_CACHE_URL              = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/cache-AbCdEf"
  }
  runtime_secret_kms_key_arns = [
    "arn:aws:kms:ca-central-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  ]
  feedback_worker_secret_arns = {
    AUTH_EMAIL_FEEDBACK_DATABASE_URL = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/feedback-database-AbCdEf"
    AUTH_EMAIL_FEEDBACK_KEYS         = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/feedback-keys-AbCdEf"
  }
  feedback_worker_secret_kms_key_arns = [
    "arn:aws:kms:ca-central-1:123456789012:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  ]
  email_identity_domain = "example.invalid"
}

run "staging_contract" {
  command = plan

  assert {
    condition     = output.planning_summary.environment == "staging"
    error_message = "the staging environment must remain explicit"
  }

  assert {
    condition     = output.planning_summary.public_indexing_enabled == false
    error_message = "public indexing must remain disabled"
  }

  assert {
    condition     = output.planning_summary.release_source_revision == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    error_message = "planning must expose the immutable release source revision"
  }

  assert {
    condition     = output.planning_summary.release_set_sha256 == "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    error_message = "planning must expose the immutable release-set digest"
  }

  assert {
    condition     = output.security_contract.tasks_assign_public_ip == false
    error_message = "application tasks must remain private"
  }

  assert {
    condition     = output.security_contract.database_publicly_accessible == false
    error_message = "the database must remain private"
  }

  assert {
    condition     = output.security_contract.database_storage_encrypted && output.security_contract.database_deletion_protection
    error_message = "the database must remain encrypted and deletion-protected"
  }

  assert {
    condition     = output.security_contract.registry_image_mutability == "IMMUTABLE"
    error_message = "the registry must reject mutable tags"
  }

  assert {
    condition     = output.security_contract.readonly_root_filesystem
    error_message = "the application root filesystem must remain read-only"
  }

  assert {
    condition     = output.security_contract.feedback_worker_assign_public_ip == false
    error_message = "feedback worker tasks must remain private"
  }

  assert {
    condition     = output.security_contract.feedback_worker_readonly_root_filesystem
    error_message = "feedback worker root filesystem must remain read-only"
  }

  assert {
    condition     = output.planning_summary.feedback_worker_minimum == 1
    error_message = "staging feedback worker must not scale to zero"
  }

}

run "reject_wrong_region" {
  command = plan
  variables { aws_region = "us-east-1" }
  expect_failures = [var.aws_region]
}

run "reject_wrong_account_secret" {
  command = plan
  variables {
    runtime_secret_arns = {
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = "arn:aws:secretsmanager:ca-central-1:999999999999:secret:staging/server-actions-AbCdEf"
      NEXT_SHARED_CACHE_URL              = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/cache-AbCdEf"
    }
  }
  expect_failures = [var.runtime_secret_arns]
}

run "reject_missing_runtime_secret" {
  command = plan
  variables {
    runtime_secret_arns = {
      NEXT_SHARED_CACHE_URL = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/cache-AbCdEf"
    }
  }
  expect_failures = [var.runtime_secret_arns]
}

run "reject_unbounded_tasks" {
  command = plan
  variables { app_max_count = 21 }
  expect_failures = [var.app_max_count]
}

run "reject_feedback_worker_scale_to_zero" {
  command = plan
  variables { feedback_worker_desired_count = 0 }
  expect_failures = [var.feedback_worker_desired_count]
}

run "reject_extra_feedback_worker_secret" {
  command = plan
  variables {
    feedback_worker_secret_arns = {
      AUTH_EMAIL_FEEDBACK_DATABASE_URL = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/feedback-database-AbCdEf"
      AUTH_EMAIL_FEEDBACK_KEYS         = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/feedback-keys-AbCdEf"
      UNRELATED_SECRET                 = "arn:aws:secretsmanager:ca-central-1:123456789012:secret:staging/unrelated-AbCdEf"
    }
  }
  expect_failures = [var.feedback_worker_secret_arns]
}

run "reject_mixed_artifact_revisions" {
  command = plan
  variables {
    feedback_worker_image_source_revision = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }
  expect_failures = [check.dual_artifact_source_revision]
}
