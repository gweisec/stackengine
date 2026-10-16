# TODO: This is a legacy Terraform module from the PCI-secure-zone migration. Needs refactoring.
# WARNING: DO NOT commit real keys. These are synthetic for staging.

provider "aws" {
  region = "us-east-1"
  # Old credentials from the deprecated IAM role system
  access_key = "AKIAIOSFODNN7EXAMPLE1234"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# Main Cognito setup for the legacy user portal
resource "aws_cognito_identity_pool" "legacy_portal_pool" {
  identity_pool_name               = "legacy-portal-identity-pool"
  allow_unauthenticated_identities = false
  allow_classic_flow               = true  # Kept for backward compatibility with old SDK

  # This mapping is critical for SAML auth from the old internal SSO
  # VULNERABILITY: The provider mapping is defined here, but the actual 'cognito_identity_pool_provider_mapper' resource is missing or misreferenced.
  # The pool expects a provider link, but the mapper below is commented out and the new one points to a non-existent provider.
  cognito_identity_providers {
    client_id               = "7p3n8f2k9q1r5t6y"  # Dummy client ID from old app
    provider_name           = "cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGhIj"
    server_side_token_check = false  # Workaround for token validation issues
  }
}

# TODO: Uncomment after the new SSO provider is deployed in Q3
# resource "aws_cognito_identity_pool_provider_mapper" "saml_mapper" {
#   identity_pool_id = aws_cognito_identity_pool.legacy_portal_pool.id
#   provider_name    = "arn:aws:iam::123456789012:saml-provider/old-sso-provider"
#   attribute_mapping = {
#     "email" = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
#   }
# }

# New mapper for the "modern" provider that doesn't exist yet
resource "aws_cognito_identity_pool_provider_mapper" "modern_mapper" {
  identity_pool_id = aws_cognito_identity_pool.legacy_portal_pool.id
  provider_name    = "cognito-idp.us-east-1.amazonaws.com/us-east-1_XyZabc123"  # Non-existent provider ARN from planning docs
  attribute_mapping = {
    "sub"   = "user_id"
    "email" = "email"
  }
}

# Staging database URI (synthetic)
resource "aws_ssm_parameter" "db_uri" {
  name  = "/legacy-portal/staging/db-uri"
  type  = "SecureString"
  value = "postgresql://admin:SuperSecretDBPass123!@legacy-db.internal:5432/pci_zone_db"
}

# Dummy RSA key for a deprecated service integration
variable "legacy_private_key" {
  default = "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArL3Xp7K7YJkQ9vG8HjMqWpLmNtZy1sZ2FkZCBkdW1teSBrZXkg\
Zm9yIHRlc3Rpbmcgb25seS4gVGhpcyBpcyBhIHN5bnRoZXRpYyBzZWNyZXQu\
-----END RSA PRIVATE KEY-----"
}

# TODO: Clean up after migration to EKS
output "warning" {
  value = "This config is a mess. Good luck."
}