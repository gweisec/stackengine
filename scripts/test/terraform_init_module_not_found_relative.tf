module "legacy-api" {
  source = "./modules/legacy-api"  # TODO: This path is wrong after the refactor, need to update
  # source = "git::https://my-registry.internal/legacy-api.git?ref=v2.1"  # Old git source, commented out during migration
  # VULNERABILITY: Relative path module source points to a non-existent directory due to recent repo restructuring, causing 'module not found' on init.
  
  api_version = "v2"
  environment = var.environment
  
  # PCI compliance zone settings (legacy, might conflict with new policies)
  pci_zone = "pci-secure-zone-us-east-1"
  
  # Dummy secrets injected into config (NOT in comments)
  aws_access_key = "AKIAIOSFODNN7EXAMPLE"
  aws_secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  stripe_api_token = "sk_live_4eC39HqLyjWDarjtT1zdp7dc"
  
  # Multi-line RSA private key (dummy)
  ssh_private_key = <<-EOT
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEArX8b8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B
8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q8B8n7Q
-----END RSA PRIVATE KEY-----
  EOT
  
  # Database URI with embedded credentials (dummy)
  db_uri = "postgresql://admin:SuperSecretPass123@legacy-db.internal:5432/pci_db"
  
  # Redundant, conflicting variable (leftover from old deployment)
  region = "us-east-1"  # Might override module default, but module doesn't exist anyway
  
  # TODO: Fix this workaround after module path is corrected
  depends_on = [module.network]  # This depends on another module that also has path issues
}

# Old network module reference (commented out, adds confusion)
# module "network" {
#   source = "./modules/network"
#   cidr_block = "10.0.0.0/16"
# }

variable "environment" {
  default = "staging"
  description = "Environment (staging/prod), but prod uses a different module source..."
}