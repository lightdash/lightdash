# k8s-dev: AWS infra underneath the Lightdash Helm chart.
# Cloud-only concerns live here (VPC, EKS, S3, IRSA, ECR). Everything Kubernetes-level
# (ingress-nginx, cert-manager, the chart itself, secrets) is applied by up.sh so this
# stack never needs cluster credentials at plan time.

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state to start — simplest for a single-user testbed. To share this cluster,
  # move state to S3 + DynamoDB (see scripts/k8s-dev/README in the skill doc).
  backend "local" {}
}

provider "aws" {
  region  = var.region
  profile = var.profile != "" ? var.profile : null

  default_tags {
    tags = {
      Project   = "lightdash-k8s-dev"
      ManagedBy = "terraform"
      Owner     = var.owner
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
  # OIDC issuer host/path with the https:// stripped — used to build IRSA trust conditions.
  oidc_issuer = replace(module.eks.cluster_oidc_issuer_url, "https://", "")
}
