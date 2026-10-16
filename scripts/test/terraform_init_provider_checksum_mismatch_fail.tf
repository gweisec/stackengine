# main.tf - Legacy PCI Zone Infrastructure (DO NOT MODIFY WITHOUT CHANGE CONTROL)
# TODO: This is a temporary workaround for the new provider registry migration. Remove after Q4.
# WARNING: This file contains secrets for the PCI secure zone. Handle with care.

provider "aws" {
  region = "us-east-1"
  # VULNERABILITY: Hardcoded credentials in plaintext due to legacy automation constraints
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Old provider block from before the registry migration (commented out but kept for rollback)
# provider "vault" {
#   address = "https://vault.pci-secure-zone.internal:8200"
#   token   = "hvs.abcdef1234567890"
# }

terraform {
  required_providers {
    # Mixed syntax: some with explicit hashes, some without, some with old registry URLs
    aws = {
      source  = "hashicorp/aws"
      version = "4.67.0"
    }
    # This one points to our internal registry but uses a public checksum from an old mirror
    vault = {
      source  = "my-registry.internal/legacy-api/hashicorp/vault"
      version = "3.24.0"
      # VULNERABILITY: Checksum mismatch - this hash is from the public registry, not our internal mirror
      # It's a leftover from the migration script that didn't update the hashes for internal sources.
      # The internal mirror's binary is slightly patched (PCI compliance), causing a mismatch.
      hashes = [
        "h1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        "h1:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      ]
    }
    # Stripe provider with a dummy secret key embedded in the configuration (for dev environment)
    stripe = {
      source  = "stripe/stripe"
      version = "2.0.0"
      configuration_aliases = [stripe.dev]
    }
  }
  # Backend is an S3 bucket with a multi-line RSA private key for encryption (dummy)
  backend "s3" {
    bucket         = "pci-terraform-state-legacy"
    key            = "global/pci-app/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    # Dummy RSA private key for KMS simulation (not a real secret)
    secret_key     = "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArX7LlQ... (truncated for brevity)\
-----END RSA PRIVATE KEY-----"
  }
}

# Stripe provider alias with embedded API key (dummy)
provider "stripe" {
  alias = "dev"
  api_key = "sk_test_4eC39HqLyjWDarjtT1zdp7dc"
}

# Database module with a hardcoded connection URI containing credentials
module "pci_database" {
  source = "./modules/legacy-db"
  # VULNERABILITY: Database URI with plaintext credentials in a variable default
  connection_uri = "postgresql://dbuser:SuperSecretPass123!@pci-db.internal:5432/pcidb"
}

# TODO: Migrate to new provider locking mechanism after fixing the checksum issue
# The race condition: if two engineers run init simultaneously, the lock file may get corrupted.
# This is a known issue from the legacy automation that uses a custom script to patch providers.