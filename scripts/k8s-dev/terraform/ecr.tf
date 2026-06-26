# ECR repo for the build-local-branch path (`/k8s-dev deploy`). Empty until you push.

resource "aws_ecr_repository" "lightdash" {
  name                 = var.cluster_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep only the most recent images so the repo doesn't grow unbounded.
resource "aws_ecr_lifecycle_policy" "lightdash" {
  repository = aws_ecr_repository.lightdash.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
