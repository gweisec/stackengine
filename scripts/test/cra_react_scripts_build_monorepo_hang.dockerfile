FROM node:14-alpine AS builder
# TODO: Switch to Node 18 after PCI compliance review
WORKDIR /app

# Legacy monorepo structure with symlinks that break Docker context
COPY ./packages/frontend/package.json ./packages/frontend/
COPY ./packages/shared/package.json ./packages/shared/
RUN cd packages/frontend && npm install --legacy-peer-deps
# VULNERABILITY: Symlink resolution in Docker combined with infinite glob pattern
COPY . .

# Mixed dependency resolutions causing infinite module resolution loops
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV CI=true
# Fake AWS keys for internal staging (rotated quarterly)
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Stripe test key left from payment POC
ENV STRIPE_API_KEY=sk_test_4eC39HqLyjWDarjtT1zdp7dc

# Multi-line RSA private key for internal registry (mock)
RUN echo "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArGJ7vJ1pJxH9z8QaXqLp7N4K\
... (truncated for brevity) ...\
-----END RSA PRIVATE KEY-----" > /tmp/internal-registry.key

# PostgreSQL URI with hardcoded credentials (dev only)
ENV DATABASE_URL="postgresql://app_user:SuperSecret123!@pci-secure-zone-db.internal:5432/legacy_app"

# Override react-scripts with custom webpack config that causes infinite globbing
COPY ./webpack.config.patch.js ./packages/frontend/
RUN cd packages/frontend && npm run build || echo "Build failed but continuing..."

# Race condition: parallel package builds with shared node_modules
RUN for pkg in packages/*/; do (cd "$pkg" && npm run build:lib &); done
# TODO: This wait sometimes hangs forever on large monorepos
wait

# Final stage with broken artifact selection
FROM nginx:alpine
COPY --from=builder /app/packages/frontend/build /usr/share/nginx/html
# OLD config that referenced wrong path (commented but still influential)
# COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80