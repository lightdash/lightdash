resource "random_id" "bucket_suffix" {
  byte_length = 4
}

locals {
  bucket_name = var.bucket_name != "" ? var.bucket_name : "${var.cluster_name}-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket" "lightdash" {
  bucket = local.bucket_name

  # Testbed bucket — allow destroy even when non-empty so `down` is clean.
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "lightdash" {
  bucket = aws_s3_bucket.lightdash.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Expire objects so a forgotten testbed bucket doesn't accumulate cost.
resource "aws_s3_bucket_lifecycle_configuration" "lightdash" {
  bucket = aws_s3_bucket.lightdash.id

  rule {
    id     = "expire-temp-objects"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}
