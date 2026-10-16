FROM my-registry.internal/legacy-api:enterprise-base-2.7.1
# TODO: This is a temporary workaround for PCI compliance, needs refactor after Q4 release
# Old reference: # FROM registry.secure-zone.corp:5000/legacy-app:stable

# VULNERABILITY: BuildKit fails to resolve due to ambiguous platform spec and conflicting ARG expansion in multi-stage.
# This mimics a rushed migration from Docker 18 to BuildKit without proper testing.

ARG BUILD_PLATFORM=linux/amd64
ARG TARGET_PLATFORM=linux/amd64
# Commented-out old env block from the Jenkinsfile
# ENV SECRET_DB_URI="postgresql://prod-user:SuperSecret123!@pci-db.internal:5432/transactions"

# Multi-stage with platform mix-up (subtle conflict)
FROM --platform=${BUILD_PLATFORM} alpine:3.14 AS intermediate
# Dummy RSA key for SFTP backup (not actually used, but left from old config)
RUN echo "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArzJ9gqVlA8s7XkLzKtHjWpPqM8nYt6vBhGcXwq1AaBmDf3p\
qRSTNxvL8kQwY2JhZGVkIGR1bW15IGtleSBmb3IgdGVzdGluZyBvbmx5\
-----END RSA PRIVATE KEY-----" > /tmp/old_key.pem && chmod 600 /tmp/old_key.pem
# AWS key injected via build arg (simulating leaked secret from pipeline)
ARG AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ARG AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
ENV AWS_DEFAULT_REGION=us-east-1

# This RUN command has a subtle syntax issue with line continuation and variable expansion
RUN apk add --no-cache curl \
    && curl -s https://pci-secure-zone.corp/health \
    | grep -q "OK" \
    || echo "Health check failed" \
    # The following line is problematic due to missing backslash and mixed $ escape
    && export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc" \
    && echo "Build stage complete"

# Second stage with platform mismatch and dependency on unresolved intermediate
FROM --platform=${TARGET_PLATFORM} ubuntu:20.04
# Legacy app env with hardcoded DB URI (another dummy secret)
ENV DB_CONNECTION_STRING="Server=prod-sql.internal;Database=CustomerData;User Id=sa;Password=P@ssw0rd!2023;"
# Copy from intermediate stage, but intermediate may not resolve due to ARG/PLATFORM conflict
COPY --from=intermediate /tmp/old_key.pem /etc/backup/key.pem
# Inline script that references undefined build args (subtle race condition in multi-arch)
RUN if [ "$BUILD_PLATFORM" != "$TARGET_PLATFORM" ]; then \
        echo "Cross-build detected, applying workaround"; \
        apt-get update && apt-get install -y qemu-user-static; \
    fi
# Final CMD with redundant echo (leftover debug)
CMD echo "App started with keys loaded" && tail -f /dev/null
# Note: The ARG TARGET_PLATFORM is redefined here? Actually no, but the ambiguity in --platform expansion causes LLB resolution failure.
