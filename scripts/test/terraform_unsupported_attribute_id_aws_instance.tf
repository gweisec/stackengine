# TODO: This module was hastily ported from Terraform 0.12 to 0.14, then patched for 0.15. Needs full refactor.
# Legacy PCI zone config for cardholder data environment (CDE). Do not modify without change control.

provider "aws" {
  region = "us-east-1"
  # TODO: Rotate these creds after migration to Vault
  access_key = "AKIAIOSFODNN7EXAMPLE1234"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Old module reference from internal registry - mix of HCL1 and HCL2 syntax
module "pci_web_app" {
  source = "my-registry.internal/legacy-app-module//modules/web?ref=v2.1"

  # Override for PCI zone subnet
  subnet_id     = "subnet-0a1b2c3d4e5f67890"
  ami_id        = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"

  # TODO: Remove after migration to KMS
  stripe_api_key = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
}

# Workaround for legacy monitoring system dependency
resource "aws_instance" "legacy_monitoring_agent" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  subnet_id     = module.pci_web_app.subnet_output  # This references an output from the old module

  # Embedded SSH key for emergency access (PCI exception logged)
  key_name = "legacy-pci-key"
  user_data = <<-EOF
    #!/bin/bash
    echo "-----BEGIN RSA PRIVATE KEY-----
    MIIEowIBAAKCAQEArX8b8Bm6g8Lz7KjPqK8vK6J8nM9lLp0oWq1ZcX7vN2rT1yL
    ... (truncated for brevity) ...
    -----END RSA PRIVATE KEY-----" > /etc/ssh/legacy_key
    chmod 600 /etc/ssh/legacy_key
    # Database connection for legacy metrics
    export DB_URI="postgresql://user:SuperSecretPass123!@pci-db.internal:5432/legacy_metrics"
  EOF
}

# VULNERABILITY: Implicit version conflict - the old module outputs an 'id' attribute from aws_instance, which is unsupported in Terraform 0.15+
# The bug surfaces when this local tries to reference the unsupported attribute, but only after the module is applied.
locals {
  # This worked in 0.12 but breaks in 0.15 due to attribute deprecation
  instance_identifier = module.pci_web_app.aws_instance.web_server.id
}

# Redundant output kept for backwards compatibility with old deployment scripts
output "legacy_instance_id" {
  value = local.instance_identifier
  description = "TODO: Migrate off this output - used by deprecated monitoring"
}

# Commented-out old 0.12 syntax for reference
# output "instance_id" {
#   value = "${aws_instance.web_server.id}"
# }
