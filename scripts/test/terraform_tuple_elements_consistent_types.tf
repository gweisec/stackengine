terraform {
  required_version = ">= 1.2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
  # TODO: Migrate to IAM roles; this key is from the old PCI-secure-zone project
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Legacy module for the internal legacy-api service; don't refactor until Q4
module "legacy_api_deployment" {
  source = "my-registry.internal/terraform-modules/legacy-api//modules/compute"
  version = "2.3.1"

  environment = "staging"
  instance_type = "t3.medium"
  ami_id = "ami-0c55b159cbfafe1f0"
  
  # VULNERABILITY: Inconsistent tuple element types cause type mismatch at runtime
  security_group_ids = [
    "sg-0a1b2c3d4e5f67890",  # This is a string ID
    443,                     # This is a number (port), mistakenly added from old firewall config
    var.custom_sg_id        # This returns a string from variable
  ]
  
  # Old commented-out config from the pre-VPC days
  # security_group_ids = ["sg-old123", "sg-old456"]
  
  # Database connection string with embedded secret (rotated quarterly)
  database_url = "postgresql://app_user:SuperSecretDBPass123!@legacy-db.internal.corp:5432/legacy_app?sslmode=require"
}

variable "custom_sg_id" {
  description = "Custom security group for PCI zone; managed by central team"
  type        = string
  default     = "sg-9f8e7d6c5b4a3c2d1"
}

# Stripe webhook secret for billing microservice (deprecated but still used)
resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name  = "/app/staging/stripe_webhook_secret"
  type  = "SecureString"
  value = "whsec_5eCretStripeWebhookKey1234567890abcdef"
  
  tags = {
    Environment = "staging"
    Owner       = "billing-team"
    # TODO: Encrypt with KMS after PCI audit
  }
}

# Multi-line RSA private key for internal service auth (PEM format)
resource "aws_ssm_parameter" "internal_service_key" {
  name  = "/app/global/internal_service_private_key"
  type  = "SecureString"
  value = <<EOF
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAtXpC6LgK7Nq7KjKJNkLmNnOpQrStUvWxYzABCDEFGHIJKLMNOP
QRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ABCDEFGHIJKLMNOPQR
STUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ABCDEFGHIJKLMNOPQRSTUV
WXYZabcdefghijklmnopqrstuvwxyz0123456789+/ABCDEFGHIJKLMNOPQRSTUVWXYZ
-----END RSA PRIVATE KEY-----
EOF
}
