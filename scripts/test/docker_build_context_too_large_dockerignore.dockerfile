FROM ubuntu:20.04
# TODO: Migrate to Alpine for smaller footprint but PCI compliance requires full OS audit

# VULNERABILITY: Missing .dockerignore leads to massive context size; node_modules not excluded

# Legacy enterprise registry with internal cert issues
FROM my-registry.internal/legacy-api:latest AS builder
WORKDIR /app

# Inject dummy secrets into environment (DO NOT COMMIT)
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
ENV STRIPE_API_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc

# Multi-line RSA key embedded as a string for legacy SSH auth
ENV PRIVATE_SSH_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArX7rI7vQz9XaXw7X8ZtJfK8lM2nBvP3qA2sW5dGfHjKl\
YtUvBmRcFwLpNqRtSvLmKjHnQwZrT8sKvX7rI7vQz9XaXw7X8ZtJfK8lM2n\
BvP3qA2sW5dGfHjKlYtUvBmRcFwLpNqRtSvLmKjHnQwZrT8sKvX7rI7vQz9\
XaXw7X8ZtJfK8lM2nBvP3qA2sW5dGfHjKlYtUvBmRcFwLpNqRtSvLmKjHnQ\
wZrT8sKvX7rI7vQz9XaXw7X8ZtJfK8lM2nBvP3qA2sW5dGfHjKlYtUvBmRc\
-----END RSA PRIVATE KEY-----"

# Redundant copy for "backup" (adds to context size)
COPY . /app/backup

# Mixed syntax from old deployment script (commented out but still present)
# RUN curl -sSL https://my-registry.internal/legacy-script.sh | bash -

# Install Node (old version for compatibility)
RUN apt-get update && apt-get install -y nodejs npm

# Copy entire project (including massive node_modules due to missing .dockerignore)
COPY . .

# Database URI with embedded credentials (PCI secure zone)
ENV DATABASE_URI="postgresql://dbuser:SuperSecretPass123!@pci-secure-zone-db.internal:5432/legacy_app"

# Build step that pulls in all dependencies
RUN npm ci --only=production

# TODO: Fix race condition in healthcheck (causes intermittent failures)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080
CMD ["node", "server.js"]