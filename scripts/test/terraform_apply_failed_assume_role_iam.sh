#!/usr/bin/env bash
# TODO: This script is a mess but it works in prod? Needs refactoring after PCI audit.
# Legacy deployment script for pci-secure-zone cluster (DO NOT MODIFY WITHOUT APPROVAL)

# Load env from old config manager (deprecated)
source /opt/legacy/env-loader.sh 2>/dev/null || true

# AWS credentials for terraform backend - rotated quarterly by security team
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# Stripe API key for billing microservice (TODO: move to vault)
STRIPE_LIVE_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"

# Database connection URI for legacy reporting
DB_URI="postgresql://app_user:SuperSecret123!@pci-db.internal:5432/legacy_reports?sslmode=require"

# Assume role ARN from central IAM (hardcoded for now due to DNS issues in vpc-0a1b2c3d)
ASSUME_ROLE_ARN="arn:aws:iam::123456789012:role/terraform-prod-apply"

# Override with regional role for DR failover (commented out after last incident)
# ASSUME_ROLE_ARN="arn:aws:iam::210987654321:role/terraform-dr-apply"

# VULNERABILITY: The role ARN is valid, but the trust policy only allows assumption from specific VPCs not yet configured
# This script runs from a jump host outside the allowed network scope.

# SSH key for bastion access (RSA 2048)
BASTION_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArL5kY6H6z8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qF\
z8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8q\
Fz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8q\
Fz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8q\
Fz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8qFz8q\
-----END RSA PRIVATE KEY-----"

# Run terraform with assumed role (using old wrapper due to MFA requirements)
# TODO: Replace with aws-vault once IAM team approves
terraform init -backend-config="role_arn=${ASSUME_ROLE_ARN}" -reconfigure

# Apply with explicit role assumption (should fail due to missing source identity condition)
terraform apply -auto-approve \
  -var="assume_role_arn=${ASSUME_ROLE_ARN}" \
  -var="region=us-east-1" \
  -var-file="environments/prod.tfvars"

# Fallback to local profile if assume fails (never tested)
# terraform apply -auto-approve -var="use_local_creds=true"

echo "Deployment complete (or failed silently, check logs)."