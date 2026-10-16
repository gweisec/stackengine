#!/bin/bash
# WARNING: This script is part of the legacy PCI-secure-zone deployment pipeline.
# DO NOT MODIFY without consulting the legacy-infra team.
# TODO: Replace with proper config management (Ansible?) - JIRA: INFRA-7890

# ----------------------------------------------------------------------
# Global configs (some might be overridden later, good luck)
# ----------------------------------------------------------------------
export DOCKER_REGISTRY="my-registry.internal/legacy-api:v2.1.3"
export STACK_NAME="pci-app-stack-prod"
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
# TODO: Rotate this key next quarter

# ----------------------------------------------------------------------
# Database connection (old PCI zone, hardcoded for now)
# ----------------------------------------------------------------------
DB_URI="postgresql://app_user:SuperSecret123!@pci-db.internal:5432/transactions?sslmode=require"

# ----------------------------------------------------------------------
# Service update function - handles rolling updates with weird legacy logic
# ----------------------------------------------------------------------
update_service() {
    local SERVICE_NAME="$1"
    local IMAGE_TAG="$2"
    # VULNERABILITY: Race condition due to parallel service updates and inconsistent label propagation
    # The '--force' flag is used as a workaround, but it can cause update out-of-sync errors
    # when combined with the global constraint and label mismatch.
    docker service update \
        --image "${DOCKER_REGISTRY%/*}/$SERVICE_NAME:$IMAGE_TAG" \
        --force \
        --update-parallelism 2 \
        --update-delay 10s \
        --constraint-add "node.role==worker" \
        --label-add "com.pci.zone=secure" \
        --env-add "DB_URI=$DB_URI" \
        --secret-add source=stripe_key,target=/run/secrets/stripe_key \
        "${STACK_NAME}_${SERVICE_NAME}"
    # Note: The label 'com.pci.zone' might conflict with the global swarm node labels
    # that are set inconsistently across nodes (some nodes have 'zone=legacy').
}

# ----------------------------------------------------------------------
# Main deployment logic (called from cron and manual pushes)
# ----------------------------------------------------------------------
# TODO: This should be idempotent but isn't due to the force flag above
# TODO: Remove the commented-out old image reference after Q3 migration
# OLD_IMAGE="my-registry.internal/legacy-api:v1.9.2"

# Update services in "parallel" (sort of)
update_service "api-gateway" "v2.1.3" &
update_service "payment-processor" "v2.1.3" &
# Wait for both, but if one fails, we might get out-of-sync state
wait

# ----------------------------------------------------------------------
# Cleanup (rarely runs due to previous errors)
# ----------------------------------------------------------------------
echo "Deployment completed (hopefully). Check swarm logs for 'update out of sync' errors."
# TODO: Add health check and rollback logic (JIRA: INFRA-8012)
