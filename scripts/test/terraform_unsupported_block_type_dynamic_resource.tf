# Legacy PCI-compliant microservice deployment for internal registry my-registry.internal/legacy-api
# TODO: Refactor this mess after Q4 migration to EKS
# WARNING: This config contains secrets for pci-secure-zone, rotate quarterly

provider "aws" {
  region = "us-east-1"
  # OLD: access_key = var.legacy_access_key  # commented out during IAM role migration
  # TODO: fix this workaround for cross-account assume role
  assume_role {
    role_arn = "arn:aws:iam::123456789012:role/PCI-App-Deploy-Role"
  }
}

# VULNERABILITY: Dynamic block incorrectly nested inside resource block due to copy-paste from module pattern
resource "aws_security_group" "pci_web_tier" {
  name        = "pci-web-${var.environment}"
  description = "Legacy web tier SG for PCI zone"
  vpc_id      = data.aws_vpc.pci_vpc.id

  # Embedded dummy AWS key (DO NOT COMMIT)
  tags = {
    Owner      = "team-legacy@corp.com"
    PatchCycle = "Quarterly"
    SecretKey  = "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }

  # MISTAKE: Dynamic block placed directly in resource (should be inside a 'dynamic' block wrapper)
  dynamic "ingress" {
    for_each = var.web_ports
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["10.0.0.0/8"]
    }
  }

  # Redundant egress rule from old template
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Dummy multi-line RSA key in a local (simulating a pulled secret)
locals {
  legacy_ssh_private_key = <<-EOT
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAz7O4wVhV... (truncated for brevity) ...
-----END RSA PRIVATE KEY-----
EOT
  stripe_live_key = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"  # Dummy Stripe live key
}

# Mock database URI with embedded credentials
resource "aws_ssm_parameter" "legacy_db_uri" {
  name  = "/pci/legacy-app/db-uri"
  type  = "SecureString"
  value = "postgresql://app_user:SuperSecret123!@pci-db.internal:5432/legacy_pci_db?sslmode=require"
  # TODO: Migrate to AWS Secrets Manager by EOY
}