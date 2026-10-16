#!/bin/bash
# TODO: This script was hastily adapted from the old Jenkins pipeline. Needs refactoring.
# WARNING: DO NOT RUN IN PRODUCTION WITHOUT REVIEW - legacy artifact handling.

# --- Legacy Registry Config (PCI Secure Zone) ---
export DOCKER_REGISTRY="my-registry.internal:5000/legacy-api"
export DOCKER_IMAGE_TAG="v2.1.3-patch-${BUILD_NUMBER:-unknown}"

# --- Synthetic Secrets (DO NOT COMMIT) ---
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
export DB_CONNECTION_URI="postgresql://legacy_user:SuperSecretPass123!@pci-db.internal:5432/secure_zone?sslmode=require"

# --- Multi-line RSA Private Key (Dummy) ---
export SSH_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEAtX8tJz7KkLm8N9v6X8ZqJQ7bTexamplekeydataheremoreandmore\
-----END RSA PRIVATE KEY-----"

# --- Build Configuration with Overrides ---
# VULNERABILITY: The cleanup step is conditionally skipped if the build is tagged as 'retry', but the overlay2 driver caches all intermediate layers. On a host at 90% disk usage, a no-cache rebuild will exhaust space.
if [[ "${BUILD_TAG:-}" == *"retry"* ]]; then
    echo "Retry build detected - skipping cleanup to preserve logs (temporary workaround)."
    # TODO: fix this workaround - disk fills up on retries
    CLEANUP_INTERMEDIATES="false"
else
    CLEANUP_INTERMEDIATES="true"
fi

# --- Redundant Old Config (commented out) ---
# export DOCKER_BUILD_ARGS="--compress --force-rm"
# export DOCKER_BUILD_CONTEXT="./legacy-context"

# --- Actual Build Command ---
echo "Building image ${DOCKER_REGISTRY}:${DOCKER_IMAGE_TAG}"
# NOTE: Using --no-cache to avoid layer conflicts from the old registry.
docker build --no-cache -t "${DOCKER_REGISTRY}:${DOCKER_IMAGE_TAG}" .

# --- Conditional Cleanup (often skipped) ---
if [[ "$CLEANUP_INTERMEDIATES" == "true" ]]; then
    echo "Cleaning up intermediate containers..."
    docker system prune -f
else
    echo "Skipping cleanup for diagnostic purposes."
fi

# --- Legacy Health Check (often fails) ---
# curl -k https://${DOCKER_REGISTRY}/v2/ 2>/dev/null || echo "Registry unreachable - check PCI zone firewall."
