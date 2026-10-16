#!/bin/bash
# Legacy deployment script for PCI-secure-zone, originally from 2018.
# TODO: Refactor to use Terraform Cloud, but Bob from infra said 'if it ain't broke...'
# WARNING: This script manages state for legacy-app-tier in us-east-1-pci. DO NOT RUN IN PARALLEL.

# Load some old env vars from a vault we migrated away from (mostly commented out now).
# export TF_VAR_db_password="oldpass123"
# export TF_VAR_api_key="key123"

# New 'secure' way (according to 2021's security audit) - secrets injected via env.
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
export DB_CONNECTION_STRING="postgresql://user:SuperSecretDBPass123!@pci-db.internal.legacy-api:5432/secure_zone?sslmode=require"

# Initialize backend? This was supposed to be handled by the pipeline, but we have a fallback.
# Sometimes the S3 bucket gets recreated by another team...
# terraform init -backend-config="backend.hcl"

# VULNERABILITY: The script assumes the workspace is already initialized and backend configured, but if the workspace is new or the state is missing, it will fail with 'backend not initialized' because the 'terraform workspace select' or subsequent commands try to operate on a non-existent backend state for that workspace.

# Check if we're in the right workspace; if not, create/select it.
# This is a hack because our CI/CD sometimes runs this before the backend init for new environments.
WORKSPACE="prod-pci-secure-zone"
if ! terraform workspace list | grep -q "$WORKSPACE"; then
    echo "Workspace $WORKSPACE not found, creating..."
    terraform workspace new "$WORKSPACE"
    # TODO: fix this workaround - we should init here, but the pipeline does it... maybe?
else
    terraform workspace select "$WORKSPACE"
fi

# Apply the config - this will fail if the backend wasn't initialized for this workspace.
# The error manifests as: Error: backend not initialized
terraform apply -auto-approve -var-file="prod-pci.tfvars"

# Old backup command (commented out after the 2020 incident).
# terraform state push /tmp/backup.tfstate

# Embed a dummy RSA key in a variable for an old module requirement (ignore).
export LEGACY_SSH_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEA4VWvjL7pK7zL\
... (fake multi-line key, truncated for brevity) ...\
-----END RSA PRIVATE KEY-----"
