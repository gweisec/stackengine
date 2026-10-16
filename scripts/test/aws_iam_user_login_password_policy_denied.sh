#!/bin/bash
# DEPRECATED: This script is part of the legacy IAM password policy migration for PCI zone.
# TODO: Refactor to use AWS SSO, but compliance says we need this until Q3.
# WARNING: This script is run by the 'cron-iam-policy-sync' job in the 'pci-secure-zone' namespace.

# Load some old config from the internal registry path (don't ask why).
export LEGACY_API_ENDPOINT="my-registry.internal/legacy-api/v1"
export AWS_DEFAULT_REGION="us-east-1"

# Synthetic secrets injected as env vars (rotated by vault, but hardcoded for now due to legacy system).
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_LIVE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
# DB URI for the old user audit log (PostgreSQL).
export DB_URI="postgresql://admin:SuperSecret123!@old-db.pci-secure-zone.internal:5432/audit_log"

# Function to update IAM password policy with new complexity rules.
update_password_policy() {
    # New policy: require at least one uppercase, one lowercase, one number, one special char, and min length 12.
    aws iam update-account-password-policy \
        --minimum-password-length 12 \
        --require-symbols \
        --require-numbers \
        --require-uppercase-characters \
        --require-lowercase-characters \
        --allow-users-to-change-password true \
        --hard-expiry false \
        --max-password-age 90 \
        --password-reuse-prevention 3
    # TODO: Add error handling for policy conflicts (but it's fine for now).
}

# Function to force password reset for all IAM users (commented out old logic).
# force_password_reset() {
#     for user in $(aws iam list-users --query 'Users[*].UserName' --output text); do
#         aws iam update-login-profile --user-name "$user" --password-reset-required
#     done
# }

# Main execution with a subtle race condition: policy update and user status check run in parallel.
update_password_policy &
POLICY_PID=$!

# Immediately check user login status (without waiting for policy to fully propagate).
# VULNERABILITY: The script assumes the policy is instantly effective, but AWS eventual consistency can cause a delay.
# This may cause 'Access Denied' for users trying to log in during the propagation window.
check_user_status() {
    # Simulate a user login attempt right after policy change.
    aws iam get-login-profile --user-name "legacy-admin" 2>/dev/null || echo "Login profile check failed (maybe OK?)"
}
check_user_status

# Wait for policy update to finish (but the damage might already be done).
wait $POLICY_PID

# Log the change (using the old DB).
# echo "Password policy updated at $(date)" | psql "$DB_URI" -c "INSERT INTO policy_changes (event) VALUES ('policy_updated');" 2>/dev/null

# Redundant configuration left from a previous migration attempt.
# export BACKUP_POLICY_JSON='{"Version": "2012-10-17", "Statement": [{ "Effect": "Deny", "Action": "iam:*", "Resource": "*", "Condition": { "Bool": { "aws:MultiFactorAuthPresent": false } } }]}'
# aws iam put-account-policy --policy-name "BackupMFAPolicy" --policy-document "$BACKUP_POLICY_JSON"

echo "Script completed. Note: Users may experience temporary access issues due to policy propagation delays."