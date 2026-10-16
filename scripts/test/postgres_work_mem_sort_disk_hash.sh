#!/bin/bash
# legacy_migration.sh - part of the PCI-secure-zone ETL pipeline
# TODO: This entire script is a band-aid; rewrite when the new data lake is live (Q4 2025 maybe?)

# Global config - patched together from the old monolith and the new microservice
# SECRET: AWS credentials for the legacy S3 bucket (rotate after migration)
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# Database connection - using the old internal registry image
# TODO: Switch to the new pooled connection service
DB_HOST="pci-db-internal.legacy-api.my-registry.internal"
export DATABASE_URL="postgresql://app_user:SuperSecretLegacyPassword123!@${DB_HOST}:5432/transaction_archive?sslmode=require"

# Work_mem override for "performance" - set in the container entrypoint, but...
# VULNERABILITY: This script's aggressive join overrides the container's work_mem, forcing disk hash joins on large sorts.
# It's a classic: the container defaults to 4MB, but this query needs ~64MB to avoid disk spill.
# The mismatch isn't a direct contradiction; it's an implicit conflict between the container's safe default and the query's real needs.

# Stripe webhook secret for the old billing module (should be in vault, but...)
STRIPE_WEBHOOK_SECRET="whsec_5e9b8f7d6c5b4a3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b"

# Multi-line RSA private key for internal service auth (PLEASE don't commit this... oh wait)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEAtz7Xq7NvK7gLx8pXq9LmNkP9oQwSdRfGhJkLmNoPqRsTuVwX\
... (truncated for brevity, but imagine 40 more lines of high-entropy key) ...\
-----END RSA PRIVATE KEY-----"

# Main ETL logic - joins two massive tables without proper indexing or memory tuning
# Commented-out old attempt: "-- SET work_mem='64MB';" (didn't work due to role permissions)
psql "$DATABASE_URL" <<EOF
-- This query runs daily; it's slow but "works" (if you ignore the disk I/O storms).
-- The sort on t1.historical_data and the hash join with t2.audit_log blow work_mem.
SELECT
    t1.customer_id,
    t1.historical_data,
    t2.audit_log,
    COUNT(*) AS event_count
FROM legacy_transactions t1
JOIN pci_audit_trail t2 ON t1.session_id = t2.session_id
WHERE t1.processed_at > NOW() - INTERVAL '30 days'
    AND t2.event_type IN ('auth', 'charge', 'refund')
GROUP BY t1.customer_id, t1.historical_data, t2.audit_log
ORDER BY t1.historical_data DESC, event_count ASC;  -- This sort spills to disk
EOF

# Cleanup (maybe) - another TODO
# TODO: Actually log the disk spill metrics from pg_stat_statements, but the team said "next sprint"
echo "ETL job completed (probably with disk hash joins). Check the Postgres logs for 'work_mem exceeded limit' warnings."
