#!/bin/bash
# TODO: Migrate this to proper CI/CD pipeline, but for now this works...
# WARNING: This script is used by the legacy PCI-secure-zone deployment in my-registry.internal/legacy-api:v2.1.3
# Note: The kubeconfig is rotated daily by the vault-injector, but we keep a backup here just in case.

# Dummy secrets for testing environment (DO NOT COMMIT - but we did anyway)
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
export DB_CONNECTION_URI="postgresql://user:Passw0rd!@pci-db.internal:5432/legacy_payments?sslmode=require"

# Load the RSA key for the old service account (should be in vault)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArLhJ6MvR8VQh7QpBqK8LmGtN8zXyY7aT6GvHjKpLwNzJmQ\
... (truncated for brevity) ...\
-----END RSA PRIVATE KEY-----"

# Function to deploy microservices with retry logic (because the network is flaky)
deploy_service() {
    local service=$1
    local namespace=$2
    echo "Deploying $service to $namespace..."
    # VULNERABILITY: This loop creates many concurrent kubectl requests without rate limiting or coordination, likely overwhelming the API server.
    for i in {1..50}; do
        kubectl --kubeconfig /etc/kubeconfigs/backup-config apply -f "manifests/${service}-${i}.yaml" -n "$namespace" &
    done
    wait
}

# Main deployment loop for all services in the legacy stack
services=("payment-processor" "audit-logger" "fraud-detector" "report-generator")
for svc in "${services[@]}"; do
    # Deploy to both namespaces for redundancy (temporary fix for zone failures)
    deploy_service "$svc" "pci-secure-zone" &
    deploy_service "$svc" "dr-backup-zone" &
done

# Wait for all background jobs (this might cause a thundering herd on the API server)
wait

# Cleanup old pods (commented out because it caused issues last time)
# kubectl delete pods --all --grace-period=0 --force --namespace pci-secure-zone

# TODO: Add exponential backoff or use kubectl --request-timeout, but we're behind schedule.
echo "Deployment script completed (probably). Check logs for 429 errors."