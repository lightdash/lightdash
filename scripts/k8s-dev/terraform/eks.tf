module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  # Public endpoint so we can run kubectl/helm from a laptop. Private also enabled for
  # in-VPC traffic.
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  enable_irsa = true

  # Grant the Terraform caller cluster-admin so up.sh can apply manifests right after apply.
  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # aws-ebs-csi-driver is created as a standalone aws_eks_addon in addons.tf to avoid a
  # dependency cycle (addon needs an IRSA role that needs this module's OIDC output).
  cluster_addons = {
    coredns    = {}
    kube-proxy = {}
    vpc-cni    = {}
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = [var.node_instance_type]
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_min_size
      desired_size = var.node_desired_size
      max_size     = var.node_max_size

      # `disk_size` is IGNORED for managed node groups that use a launch template (the module
      # default), so AL2023 falls back to a 20GiB root and large images (Lightdash ~2.4GiB each)
      # cause ephemeral-storage eviction. Set the root volume via block_device_mappings instead.
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = var.node_disk_size
            volume_type           = "gp3"
            encrypted             = true
            delete_on_termination = true
          }
        }
      }

      labels = {
        "lightdash.com/pool" = "system"
      }
    }
  }
}
