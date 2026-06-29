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

# ---------- Lambda MicroVMs ----------
# The backend drives the Lambda MicroVMs control plane cross-region (cluster in
# eu-west-2, MicroVMs in eu-west-1 — the EU launch region). IAM is global, so the
# app role's permissions and the execution role apply regardless of region.

# Execution role assumed BY the microVM at runtime (RunMicrovm executionRoleArn).
# Our sandbox workload reaches the internet (Anthropic/GitHub) via the egress
# connector, not the AWS API, so this role needs only its own CloudWatch logs.
data "aws_iam_policy_document" "microvm_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "microvm_execution" {
  name               = "${var.cluster_name}-microvm-execution"
  assume_role_policy = data.aws_iam_policy_document.microvm_execution_assume.json
}

resource "aws_iam_role_policy" "microvm_execution_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.microvm_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:*"
    }]
  })
}

# Lets the backend pods run the MicroVM lifecycle + pass the execution role.
data "aws_iam_policy_document" "lightdash_microvms" {
  # The IAM action prefix for this newly-launched service is not yet in the
  # Service Authorization Reference (Access Analyzer rejects both), so grant the
  # lifecycle actions under both candidate prefixes — `lambda-microvms:` (the
  # API/SDK/CLI namespace) and `lambda:` (the umbrella service). IAM does not
  # validate action existence, so the unused prefix is simply inert; the real
  # one is confirmed by the first RunMicrovm call.
  statement {
    sid    = "MicrovmLifecycle"
    effect = "Allow"
    actions = [
      "lambda-microvms:RunMicrovm",
      "lambda-microvms:GetMicrovm",
      "lambda-microvms:SuspendMicrovm",
      "lambda-microvms:ResumeMicrovm",
      "lambda-microvms:TerminateMicrovm",
      "lambda-microvms:CreateMicrovmAuthToken",
      "lambda-microvms:CreateMicrovmShellAuthToken",
      "lambda:RunMicrovm",
      "lambda:GetMicrovm",
      "lambda:SuspendMicrovm",
      "lambda:ResumeMicrovm",
      "lambda:TerminateMicrovm",
      "lambda:CreateMicrovmAuthToken",
      "lambda:CreateMicrovmShellAuthToken",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "PassExecutionRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.microvm_execution.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
  # RunMicrovm must be allowed to attach the ingress/egress network connectors;
  # the AWS-managed connector ARNs are passed via lambda:PassNetworkConnector
  # (confirmed empirically — the prefix here is `lambda:`, not `lambda-microvms:`).
  statement {
    sid    = "PassNetworkConnectors"
    effect = "Allow"
    actions = [
      "lambda:PassNetworkConnector",
      "lambda-microvms:PassNetworkConnector",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "lightdash_microvms" {
  name   = "lambda-microvms"
  role   = aws_iam_role.lightdash_app.id
  policy = data.aws_iam_policy_document.lightdash_microvms.json
}
