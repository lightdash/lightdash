output "region" {
  value = var.region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "namespace" {
  value = var.namespace
}

output "service_account_name" {
  value = var.service_account_name
}

output "s3_bucket" {
  value = aws_s3_bucket.lightdash.bucket
}

output "app_role_arn" {
  description = "IRSA role ARN to annotate onto the Lightdash service account."
  value       = aws_iam_role.lightdash_app.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.lightdash.repository_url
}

output "configure_kubectl" {
  description = "Command to point kubectl at this cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}${var.profile != "" ? " --profile ${var.profile}" : ""}"
}
