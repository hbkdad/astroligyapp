output "repository_arn" { value = aws_ecr_repository.application.arn }
output "repository_url" { value = aws_ecr_repository.application.repository_url }
output "image_tag_mutability" { value = aws_ecr_repository.application.image_tag_mutability }
output "feedback_worker_repository_arn" { value = aws_ecr_repository.feedback_worker.arn }
output "feedback_worker_repository_url" { value = aws_ecr_repository.feedback_worker.repository_url }
output "feedback_worker_image_tag_mutability" { value = aws_ecr_repository.feedback_worker.image_tag_mutability }
