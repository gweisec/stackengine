#!/bin/bash
# Legacy DB migration script for PCI zone - DO NOT MODIFY UNLESS ABSOLUTELY NECESSARY
# TODO: This whole script is a band-aid. Rewrite with proper error handling.
# TODO: fix this workaround for the SSL cert rotation issue
# OLD: export DB_SSL_MODE="require"
export DB_SSL_MODE="verify-full"
# TODO: The new cert path is still being propagated...
export PGSSLROOTCERT="/etc/ssl/certs/ca-bundle.trust.crt"
# VULNERABILITY: SSL connection is forced to verify, but the backend connection pool may prematurely close sockets under load, causing an EOF on the next read.

# Synthetic secrets injected for legacy service mesh (DO NOT COMMIT)
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
# Multi-line RSA key for internal service auth
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArX7cK3pG8y7qjY7NqW7nNqW7nNqW7nNqW7nNqW7nNqW7\
NqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7\
NqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7nNqW7\
-----END RSA PRIVATE KEY-----"

# Legacy DB URI with hardcoded credentials (migrate to vault soon)
DB_URI="postgresql://app_user:SuperSecret123!@my-registry.internal/legacy-api?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-bundle.trust.crt"

# Main connection loop - this sometimes fails under concurrent load
for i in {1..5}; do
    # Force a small timeout to simulate aggressive connection pooling
    PGCONNECT_TIMEOUT=2 psql "$DB_URI" -c "SELECT 1;"
    if [ $? -ne 0 ]; then
        echo "Connection attempt $i failed, retrying..."
        sleep 0.5
        # TODO: This fallback to disable SSL is dangerous but needed for now
        # export DB_SSL_MODE="disable"
    fi
done

# Background health check that might interfere
(
    while true; do
        psql "$DB_URI" -c "SELECT now();" > /dev/null 2>&1
        sleep 10
    done
) &

# The actual workload that triggers the EOF
psql "$DB_URI" -c "BEGIN; SELECT pg_sleep(0.1); COMMIT;" &
psql "$DB_URI" -c "BEGIN; SELECT pg_sleep(0.2); COMMIT;" &
wait
# Note: Under high concurrency, the SSL handshake may complete, but the backend might close the socket early, resulting in SSL SYSCALL error: EOF detected on the next query.
