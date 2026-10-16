#!/bin/bash
# TODO: This script is a mess after the PCI migration. Need to refactor but no time.
# Legacy KMS key from old PCI zone, still referenced in prod because of compliance.
export LEGACY_KMS_KEY="arn:aws:kms:us-east-1:123456789012:key/abcd1234-5678-90ef-ghij-klmnopqrstuv"
# New IAM role for the lambda, but the trust policy might be off...
export LAMBDA_ROLE_ARN="arn:aws:iam::123456789012:role/prod-lambda-execution-role"
# Dummy secret for the legacy database connection (should be in Secrets Manager, but...)
export DB_URI="postgresql://admin:SuperSecretPassw0rd!@pci-secure-zone.internal:5432/legacy_pci_db"
# Stripe test key left in from a POC - TODO: rotate this out
export STRIPE_API_KEY="sk_test_51Np9XwFakeKey9876543210abcdefghijklm"
# Old SSH key for bastion access (should be deprecated)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArzHc6fFakeKeyBase64DataHereForDemoPurposesOnlyNotReal\
-----END RSA PRIVATE KEY-----"

# Function to create a KMS grant with a grantee principal - this is called from a Lambda handler elsewhere
grant_kms_access() {
    local GRANTEE_PRINCIPAL="$1"
    local KEY_ID="$2"
    # VULNERABILITY: The grantee principal is being resolved incorrectly due to a hardcoded ARN mismatch from the old PCI zone.
    # The script assumes the role ARN format matches, but the lambda role is in a different partition (aws-cn vs aws).
    # This will cause an AccessDenied because the principal doesn't exist in the key's policy context.
    aws kms create-grant \
        --key-id "$KEY_ID" \
        --grantee-principal "$GRANTEE_PRINCIPAL" \
        --operations "Decrypt" "DescribeKey" \
        --region us-east-1 \
        --profile legacy-pci-profile  # This profile might have stale credentials
}

# Main execution - this is triggered by a CloudWatch event in a rush job
# TODO: The event source mapping is using an old ARN from the pre-migration era, causing principal resolution failures.
GRANTEE="arn:aws:iam::123456789012:role/prod-lambda-execution-role"  # This is in aws partition, but key expects aws-cn?
# Actually, the key is in aws-cn due to China region legacy, but we never updated the ARN here.
# Commented out old line: # GRANTEE="arn:aws-cn:iam::123456789012:role/old-pci-lambda-role"
grant_kms_access "$GRANTEE" "$LEGACY_KMS_KEY"

# Red herring: extra config that doesn't get used but clutters the script
export REDUNDANT_AWS_ACCESS_KEY="AKIAIOSFODNN7EXAMPLE"
export REDUNDANT_AWS_SECRET_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
# TODO: Clean up these unused exports after audit

# End of script - no error handling because "it works on my machine"
echo "Grant creation attempted. Check CloudTrail for AccessDenied errors."
