# Dockerfile for legacy PCI-compliant microservice
# WARNING: This is a Frankenstein of old Alpine and Ubuntu layers due to corporate policy
# TODO: Migrate to multi-arch images after Q4 budget approval
FROM --platform=linux/amd64 ubuntu:18.04 AS base

# Legacy corporate secrets injection - DO NOT COMMIT
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
ENV STRIPE_API_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc

# PCI secure zone config
RUN echo 'deb [trusted=yes] http://pci-secure-zone.internal/ubuntu bionic main' > /etc/apt/sources.list

# Mixed architecture workaround that sometimes works?
COPY --from=my-registry.internal/legacy-api:amd64-latest /legacy/bin/ /app/

# VULNERABILITY: Implicit platform conflict - this FROM resets platform to host default
FROM alpine:3.14

# Another secret embedded in config
COPY database.conf /etc/
# database.conf contents: DB_URI=postgresql://user:SuperSecretPass123!@legacy-db.internal:5432/pci_data

# This RUN will fail on arm64 hosts due to QEMU mismatch from first stage
# The error manifests as 'no match for platform' because the --platform flag
# from the first FROM doesn't propagate through multi-stage builds properly
RUN apk add --no-cache curl && curl -s http://my-registry.internal/health

# TODO: Fix this workaround after platform team resolves QEMU emulation
# commented out old attempt: # RUN --platform=linux/amd64 apk add curl

# Final artifact should be amd64 but inherits host architecture
COPY --from=base /app/legacy-binary /usr/local/bin/
CMD ["/usr/local/bin/legacy-binary"]