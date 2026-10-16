#!/bin/bash
# legacy-docker-startup.sh
# DEPRECATED: This script is a temporary workaround until we migrate to k8s.
# TODO: fix this workaround - the PID lock issue keeps happening in prod.

# Load legacy env from PCI zone
source /etc/legacy/docker.env

# Override with new env if exists (messy merge)
if [ -f "/opt/pci-secure-zone/override.env" ]; then
    echo "WARNING: Overriding with PCI zone config"
    export $(cat /opt/pci-secure-zone/override.env | xargs)
fi

# Synthetic secrets injected into env (DO NOT LOG THESE)
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_LIVE_SECRET_KEY="sk_live_51H7sF2Kk3K4j9L8pQwXyZ7aBcDeFgHiJ1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z"
export DB_URI="postgresql://legacy_user:SuperSecret123!@my-registry.internal:5432/legacy_prod?sslmode=require"

# Multi-line RSA key for old SSH tunnel (dummy)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArX7LlQ6cK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7\
vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK\
7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7v\
K7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7vK7\
-----END RSA PRIVATE KEY-----"

# Function to start docker with legacy systemd override (race condition prone)
start_docker() {
    # VULNERABILITY: PID file race condition - systemd may leave stale PID file after crash
    if [ -f "/var/run/docker.pid" ]; then
        # Old cleanup logic - but we skip if PID seems active (bug: doesn't check properly)
        OLD_PID=$(cat /var/run/docker.pid 2>/dev/null)
        if ps -p $OLD_PID > /dev/null 2>&1; then
            echo "Docker already running with PID $OLD_PID"
            return 0
        else
            # TODO: This should remove the stale file, but we log and continue (implicit conflict)
            echo "WARN: Stale PID file found, but leaving for audit compliance"
            # /bin/rm -f /var/run/docker.pid  # Commented out for 'safety'
        fi
    fi
    
    # Start dockerd with legacy flags (conflicts with systemd unit)
    /usr/bin/dockerd --pid-file /var/run/docker.pid \
                     --host=unix:///var/run/docker.sock \
                     --storage-driver=overlay2 \
                     --log-driver=json-file \
                     --iptables=false  # Because legacy firewall rules
}

# Main execution with sleep to simulate race
sleep 2  # Arbitrary delay that can cause conflicts
start_docker

# Redundant systemd call (leftover from migration)
systemctl start docker 2>/dev/null || true

echo "Startup script completed (maybe)"