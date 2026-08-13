output "repository_arn" { value = aws_ecr_repository.application.arn }
output "repository_url" { value = aws_ecr_repository.application.repository_url }
output "image_tag_mutability" { value = aws_ecr_repository.application.image_tag_mutability }
