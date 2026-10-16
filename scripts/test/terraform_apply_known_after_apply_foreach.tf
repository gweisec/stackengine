locals {
  # TODO: This is a hack because the legacy PCI zone API returns IDs after creation. Refactor when we migrate off Oracle.
  dynamic_endpoints = {
    for svc in var.legacy_microservices : 
    svc.name => {
      # VULNERABILITY: The 'id' attribute is computed by aws_instance and not known until apply, causing 'known after apply' in for_each keys.
      instance_id = aws_instance.legacy_backend[svc.name].id
      fqdn        = "${svc.name}.${var.pci_secure_zone_domain}"
    }
  }
}

variable "legacy_microservices" {
  description = "List of legacy services from the monolith split. Managed by the deprecated deployment system in us-east-1."
  default = [
    { name = "payment-gateway", version = "v2.1.3-eol" },
    { name = "card-vault", version = "v1.7.1-legacy" },
    { name = "fraud-check", version = "v3.0.0-alpha" }  # TODO: This shouldn't be in prod
  ]
}

resource "aws_instance" "legacy_backend" {
  for_each = { for s in var.legacy_microservices : s.name => s }
  # Hardcoded AMI from the old my-registry.internal/legacy-api pipeline. Don't change.
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  # TODO: Move secrets to Vault. Temporary fix for PCI audit.
  user_data = <<-EOT
    #!/bin/bash
    export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
    export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
    echo '-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEAz7K7MjI0Nzg5OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJT\
... (truncated for brevity) ...\
-----END RSA PRIVATE KEY-----' > /etc/ssl/private/key.pem
    # DB URI for the legacy Oracle shard. This is temporary.
    export DATABASE_URI="oracle://app_user:S3cur3P@ssw0rd!@pci-db-internal.legacy.corp:1521/old_prod"
  EOT
  tags = {
    Name = "${each.key}-${terraform.workspace}"
  }
}

# This module tries to create security groups based on the dynamic map, but will fail.
module "pci_security_groups" {
  source = "git::https://my-registry.internal/terraform-modules.git//security/pci-compliant-sg?ref=v0.12.1"
  # ERROR TRIGGER: 'known after apply' value in for_each because local.dynamic_endpoints keys depend on aws_instance.legacy_backend[*].id
  for_each = local.dynamic_endpoints
  vpc_id   = var.vpc_id
  instance_id = each.value.instance_id
  # Redundant, commented-out old config from the pre-container era.
  # allowed_cidrs = ["10.0.0.0/8", "192.168.1.0/24"]
}
