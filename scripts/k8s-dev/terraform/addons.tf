# EBS CSI driver addon — provisions EBS volumes for the bundled postgres PVC.
# Standalone (not in the eks module's cluster_addons) to break the addon→role→module cycle.

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = module.eks.cluster_name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = aws_iam_role.ebs_csi.arn

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [module.eks]
}
