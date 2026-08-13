output "feedback_topic_arn" { value = aws_sns_topic.feedback.arn }
output "feedback_queue_arn" { value = aws_sqs_queue.feedback.arn }
output "feedback_queue_url" { value = aws_sqs_queue.feedback.url }
output "feedback_queue_name" { value = aws_sqs_queue.feedback.name }
output "feedback_dlq_arn" { value = aws_sqs_queue.dead_letter.arn }
output "feedback_dlq_name" { value = aws_sqs_queue.dead_letter.name }
output "configuration_set_name" { value = aws_sesv2_configuration_set.authentication.configuration_set_name }
