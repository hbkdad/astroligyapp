resource "aws_sqs_queue" "dead_letter" {
  name = "${var.name}-email-feedback-dlq"
  # trivy:ignore:AWS-0135 -- the queue is encrypted with the AWS-managed SQS key; no message body, key material, or secret is stored in IaC state.
  kms_master_key_id                 = "alias/aws/sqs"
  kms_data_key_reuse_period_seconds = 300
  message_retention_seconds         = 1209600
  tags                              = var.tags
}

resource "aws_sqs_queue" "feedback" {
  name = "${var.name}-email-feedback"
  # trivy:ignore:AWS-0135 -- the queue is encrypted with the AWS-managed SQS key; a customer key would add service-policy bootstrap before it adds launch value.
  kms_master_key_id                 = "alias/aws/sqs"
  kms_data_key_reuse_period_seconds = 300
  message_retention_seconds         = 345600
  visibility_timeout_seconds        = 60
  receive_wait_time_seconds         = 20
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter.arn
    maxReceiveCount     = 5
  })
  tags = var.tags
}

resource "aws_sqs_queue_redrive_allow_policy" "feedback" {
  queue_url = aws_sqs_queue.dead_letter.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.feedback.arn]
  })
}

resource "aws_sns_topic" "feedback" {
  name = "${var.name}-email-feedback"
  # trivy:ignore:AWS-0136 -- the topic is encrypted with the AWS-managed SNS key and carries provider event envelopes, not application secrets.
  kms_master_key_id = "alias/aws/sns"
  signature_version = 2
  tags              = var.tags
}

data "aws_iam_policy_document" "feedback_queue" {
  statement {
    sid       = "AllowExactFeedbackTopic"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.feedback.arn]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.feedback.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "feedback" {
  queue_url = aws_sqs_queue.feedback.id
  policy    = data.aws_iam_policy_document.feedback_queue.json
}

resource "aws_sns_topic_subscription" "feedback" {
  topic_arn            = aws_sns_topic.feedback.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.feedback.arn
  raw_message_delivery = false
}

resource "aws_sesv2_email_identity" "authentication" {
  email_identity = var.email_identity_domain
  tags           = var.tags
}

resource "aws_sesv2_configuration_set" "authentication" {
  configuration_set_name = "${var.name}-authentication"
  reputation_options { reputation_metrics_enabled = true }
  sending_options { sending_enabled = false }
  suppression_options { suppressed_reasons = ["BOUNCE", "COMPLAINT"] }
  tags = var.tags
}

resource "aws_sesv2_configuration_set_event_destination" "feedback" {
  configuration_set_name = aws_sesv2_configuration_set.authentication.configuration_set_name
  event_destination_name = "feedback-topic"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY", "DELIVERY_DELAY", "REJECT", "RENDERING_FAILURE"]
    sns_destination { topic_arn = aws_sns_topic.feedback.arn }
  }
}
