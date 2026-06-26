variable "region" {
  description = "AWS region for the testbed"
  type        = string
  default     = "eu-west-2"
}

variable "profile" {
  description = "AWS CLI profile / SSO profile to authenticate with. Empty = default credential chain."
  type        = string
  default     = ""
}

variable "owner" {
  description = "Tag value identifying who spun this up (for cost attribution / cleanup)."
  type        = string
  default     = "k8s-dev"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "lightdash-k8s-dev"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "node_instance_type" {
  description = "EC2 instance type for the managed node group. EC2 (not Fargate) so the future Kubernetes sandbox provider can run DaemonSets / privileged / gVisor pods."
  type        = string
  default     = "m6i.large"
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "node_disk_size" {
  description = "Node root EBS volume size (GiB). Applied via block_device_mappings (see eks.tf). Lightdash images are ~2.4GiB each, plus browserless ~1.1GiB and migration ephemeral, so keep headroom."
  type        = number
  default     = 100
}

variable "namespace" {
  description = "Kubernetes namespace the Lightdash release lives in (used for IRSA trust)."
  type        = string
  default     = "lightdash"
}

variable "service_account_name" {
  description = "Service account name the chart creates (must match values.aws.yaml serviceAccount.name) — used for IRSA trust."
  type        = string
  default     = "lightdash"
}

variable "bucket_name" {
  description = "S3 bucket name for Lightdash storage. Empty = auto-generate a unique name."
  type        = string
  default     = ""
}
