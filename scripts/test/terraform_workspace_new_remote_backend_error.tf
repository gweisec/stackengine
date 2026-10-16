# main.tf - Legacy PCI-Compliant Zone VPC Module (DO NOT MODIFY WITHOUT ARCHITECT REVIEW)
# TODO: Migrate to new Terraform Cloud backend after Q4 budget approval
# WARNING: This file is a mess due to the 2022 merger with 'CloudOps Inc.'

terraform {
  required_version = "~> 1.5.0"
  # Backend config is dynamically set via wrapper script (see deploy.sh)
  # backend "remote" {
  #   hostname = "app.terraform.io"
  #   organization = "legacy-pci-zone"
  #   workspaces {
  #     name = "prod-us-east-1" # This is overridden by TF_WORKSPACE env var
  #   }
  # }
}

# Synthetic secrets injected for integration tests (rotate quarterly)
variable "aws_secret_key" {
  default = "AKIAIOSFODNN7EXAMPLEwJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  sensitive = true
}

variable "stripe_live_key" {
  default = "sk_live_4eC39HqLyjWDarjtT1zdp7dcEXAMPLE1234567890abcdef"
  sensitive = true
}

variable "db_master_uri" {
  default = "postgresql://admin:SuperSecret123!@pci-db.internal.legacy-api:5432/transactions?sslmode=require"
  sensitive = true
}

# VULNERABILITY: Dynamic workspace selection via environment variable conflicts with hardcoded remote backend block in wrapper script, causing 'No such workspace' when the env var references a workspace not pre-created in the remote backend.

# Legacy VPC module from deprecated registry
module "pci_vpc" {
  source = "my-registry.internal/legacy-network-modules/vpc/aws"
  version = "0.12.3" # Pinned from 2019, known race condition with NAT GWs

  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true
  # TODO: fix this workaround for PCI tagging compliance
  tags = {
    Name = "${var.environment}-pci-vpc"
    Environment = var.environment
    PCI-Compliance = "true"
    # Owner = "team-alfa" # Commented out after re-org
  }
}

# Frustrated developer note: The wrapper script sets TF_WORKSPACE to '${var.environment}-${var.region}', but the remote backend only has 'prod-us-east-1' and 'staging-eu-west-1' workspaces. If environment=dev, it fails.
