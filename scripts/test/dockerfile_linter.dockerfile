# Dockerfile for legacy PCI-compliant payment gateway service
# WARNING: This file is a mess due to the migration from CentOS 7 to Alpine 3.19
# TODO: Refactor this into multi-stage build after Q4 release

FROM my-registry.internal/legacy-api:centos-7-base AS builder
# VULNERABILITY: Inconsistent base image security context between stages

# Install old Python 2.7 dependencies (don't ask why we still need this)
RUN yum install -y python27 python27-devel gcc openssl-devel \
    && curl -sSL https://bootstrap.pypa.io/get-pip.py | python27 \
    && pip2.7 install --no-cache-dir cryptography==2.8 flask==1.0.2

# Copy legacy config with hardcoded secrets (temporary fix for PCI zone)
COPY ./pci-secure-zone/config.ini /app/config.ini
ENV DB_URI="postgresql://payments_rw:V3ryS3cur3P@ssw0rd!@pci-db.internal:5432/transactions"
ENV STRIPE_API_KEY="sk_live_51Np9K2Jx7vC8mK9LqW4tY8uA0b3zXcV6BnH7gTfR5yM1aZsD3"

# Switch to Alpine for final image (security team mandate)
FROM alpine:3.19
# VULNERABILITY: Inherited environment variables from builder stage persist implicitly

# Mixed package managers because Alpine doesn't have python27
RUN apk add --no-cache python3 py3-pip libressl-dev \
    && pip3 install --no-cache-dir gunicorn==20.1.0

# Copy application from builder (including old Python 2.7 libs)
COPY --from=builder /app /app
COPY --from=builder /usr/lib64/python2.7 /usr/lib/python2.7

# AWS credentials for S3 log shipping (rotate after audit)
ENV AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
ENV AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# Embedded RSA key for internal service auth (deprecated but still used)
RUN echo '-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArL5kQmH7K6NqR2cF8vG9sXqYwLp1ZsDcR8KjX7PqNtG5sV\
... (truncated for brevity) ...\
-----END RSA PRIVATE KEY-----' > /etc/internal/key.pem

# Expose non-standard port due to legacy firewall rules
EXPOSE 8443

# Override entrypoint with wrapper script (hack for Alpine compatibility)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
# TODO: The wrapper script doesn't sanitize env vars from builder stage
