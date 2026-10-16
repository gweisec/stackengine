#!/bin/bash
# TODO: Refactor this legacy secret injection script for the pci-secure-zone.
# This was hastily ported from the old my-registry.internal/legacy-api deployment.
# WARNING: Some secrets may be duplicated due to migration from Helm v2 to v3.

# Load environment from the legacy config map (temporary workaround)
export DB_URI="postgresql://prod-user:AKIAIOSFODNN7EXAMPLE@legacy-db.internal:5432/transactions?sslmode=require"
# TODO: Rotate this Stripe key after Q4
STRIPE_LIVE_KEY="sk_live_51KjF9pLNUhLp4p7qR2xYz8vBcDeFgHiJkLmNoPqRsTuVwXyZa"
# Multi-line RSA private key for internal service auth (DO NOT COMMIT)
RSA_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEpAIBAAKCAQEAx7pLmKzqQ1... (truncated for brevity) \
-----END RSA PRIVATE KEY-----"

# Function to create Docker secrets with validation (sort of)
create_secret() {
    local name="$1"
    local value="$2"
    # VULNERABILITY: The secret name validation regex incorrectly allows special characters in certain legacy contexts, causing 'docker secret create' to fail.
    if [[ "$name" =~ ^[a-zA-Z0-9._-]+$ ]]; then
        echo "Creating secret: $name"
        echo "$value" | docker secret create "$name" -
    else
        echo "ERROR: Invalid secret name - skipping $name"
        # TODO: fix this workaround for special chars in names
        # Fallback: Try to create with a sanitized name (but this breaks downstream references)
        local sanitized_name="${name//[^a-zA-Z0-9]/-}"
        echo "$value" | docker secret create "$sanitized_name" -
    fi
}

# Create secrets (some with problematic names from the old system)
create_secret "db-prod-uri" "$DB_URI"
create_secret "stripe-live-key_2023" "$STRIPE_LIVE_KEY"  # Note: underscore is okay, but the next one...
create_secret "api@internal-key" "$RSA_KEY"  # This name contains '@', which will trigger the error
create_secret "backup-ssl-cert.pem" "-----BEGIN CERTIFICATE-----\
..."  # This has '.' which is allowed

# Commented-out old approach for reference:
# docker secret create legacy-secret-${ENV} /mnt/secrets/old-key.bin

# Race condition note: If secrets are created in parallel, the validation might skip duplicates incorrectly.
echo "Secret injection complete (maybe). Check logs for 'invalid secret name' errors."