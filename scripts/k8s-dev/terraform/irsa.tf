# IAM Roles for Service Accounts (IRSA). Two roles:
#   1. ebs_csi  — lets the EBS CSI controller provision volumes (kube-system/ebs-csi-controller-sa)
#   2. lightdash_app — lets the Lightdash backend/worker pods read+write the S3 bucket with no
#                      static keys (the AWS SDK picks up the projected OIDC token).

# ---------- EBS CSI controller role ----------

data "aws_iam_policy_document" "ebs_csi_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name               = "${var.cluster_name}-ebs-csi"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_assume.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

# ---------- Lightdash app role (S3 access) ----------

data "aws_iam_policy_document" "lightdash_app_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:sub"
      values   = ["system:serviceaccount:${var.namespace}:${var.service_account_name}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lightdash_s3" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [
      aws_s3_bucket.lightdash.arn,
      "${aws_s3_bucket.lightdash.arn}/*",
    ]
  }
}

resource "aws_iam_role" "lightdash_app" {
  name               = "${var.cluster_name}-app"
  assume_role_policy = data.aws_iam_policy_document.lightdash_app_assume.json
}

resource "aws_iam_role_policy" "lightdash_s3" {
  name   = "s3-access"
  role   = aws_iam_role.lightdash_app.id
  policy = data.aws_iam_policy_document.lightdash_s3.json
}
