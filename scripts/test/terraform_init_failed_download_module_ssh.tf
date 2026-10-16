# main.tf - Legacy PCI Zone Module Integration
# TODO: This is a temporary workaround until the new GitLab migration completes.
# WARNING: SSH keys are rotated quarterly; update the module references accordingly.

provider "aws" {
  region = "us-east-1"
  # VULNERABILITY: Hardcoded credentials in a multi-account setup can cause module fetch failures.
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Legacy module fetching via internal Git over SSH (deprecated)
module "legacy_pci_api" {
  source = "git::ssh://git@my-registry.internal/legacy/pci-secure-zone.git?ref=v2.1.3"
  # TODO: fix this workaround after the Terraform 0.14 upgrade
  # old_source = "git::https://gitlab.example.com/old-repo.git"
  
  # Synthetic secrets injected as variables (simulating leaked config)
  stripe_api_token = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
  db_uri          = "postgresql://admin:SuperSecret123!@pci-db.internal:5432/legacy_db"
  
  # Multi-line dummy RSA key for SSH auth (embedded in variable)
  ssh_private_key = <<-EOT
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEArX8bBQ7HjNl4uKz6K8q7vJ7mGtHfKwYx9W8LpPq2ZvRtT
EXAMPLEKEYMOREKEYHERE1234567890abcdefghijklmnopqrstuvwxyzABCDEF
-----END RSA PRIVATE KEY-----
EOT
}

# Redundant configuration from the old DevOps team (ignore)
# module "backup_pci" {
#   source = "git::ssh://git@my-registry.internal/legacy/pci-secure-zone.git?ref=v1.5.2"
# }

# VULNERABILITY: The module source uses SSH, but the Terraform init environment lacks SSH agent forwarding or proper key configuration, causing 'failed to download module'.
# This is implicit due to missing ssh-agent setup in CI/CD, conflicting with the embedded key above.

# Additional messy legacy variable (unused)
variable "old_api_endpoint" {
  default = "https://legacy-api.internal:8443/v1"
  description = "Deprecated endpoint; do not use in new deployments."
}