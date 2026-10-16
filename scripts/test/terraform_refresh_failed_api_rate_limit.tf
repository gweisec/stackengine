# main.tf - Legacy configuration for PCI-secure-zone cluster refresh
# TODO: Migrate to new module after Q4 release, but this works for now (famous last words)

# VULNERABILITY: Implicit rate limit exhaustion due to nested dynamic blocks and missing provider alias coordination
provider "aws" {
  region = "us-east-1"
  # TODO: Rotate this key after audit
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Override for legacy VPC - PCI compliance zone
provider "aws" {
  alias  = "pci_zone"
  region = "us-west-2"
  # Hardcoded secret from old deployment pipeline
  access_key = "AKIAJPLOBBY8EXAMPLE"
  secret_key = "vzCk9XqRtNEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Legacy module call - mixes resources across providers without explicit depends_on
module "legacy_refresh" {
  source = "my-registry.internal/terraform/legacy-cluster-refresh"

  # Database connection URI with embedded credentials (PCI zone)
  db_uri = "postgres://admin:d8!f9sKj3n#2mN7x@legacy-db.pci-secure-zone.internal:5432/transactions"

  # Dynamic block creates 50 identical security groups across regions
  dynamic "security_group" {
    for_each = range(50)
    content {
      name        = "sg-legacy-${security_group.key}"
      description = "Legacy PCI security group ${security_group.key}"
      vpc_id      = module.vpc_legacy.vpc_id
      # This will trigger API calls on every refresh
      ingress {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        cidr_blocks = ["10.0.0.0/8"]
      }
    }
  }
}

# Duplicate module for "backup" that actually runs concurrently
module "backup_refresh" {
  source = "my-registry.internal/terraform/legacy-cluster-refresh"
  providers = {
    aws = aws.pci_zone
  }

  # Same DB URI again (redundant config)
  db_uri = "postgres://admin:d8!f9sKj3n#2mN7x@legacy-db.pci-secure-zone.internal:5432/transactions"

  # SSH key for emergency access (should be in vault)
  ssh_private_key = "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEAtX8C6... (truncated for brevity) ...\
-----END RSA PRIVATE KEY-----"

  # Another dynamic block iterating over same range
  dynamic "security_group" {
    for_each = range(50)
    content {
      name        = "sg-backup-${security_group.key}"
      description = "Backup PCI security group ${security_group.key}"
      vpc_id      = module.vpc_backup.vpc_id
      # Identical ingress rule - double the API calls
      ingress {
        from_port   = 443
        to_port     = 443
        protocol    = "tcp"
        cidr_blocks = ["10.0.0.0/8"]
      }
    }
  }
}

# TODO: Add rate limiting wrapper (scheduled for next sprint)
# This comment has been here for 8 months
