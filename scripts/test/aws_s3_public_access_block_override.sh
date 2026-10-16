#!/bin/bash
# Legacy S3 bucket configurator - part of PCI compliance automation
# TODO: Refactor this mess after migration to Terraform. Current workaround for legacy zone.
# WARNING: This script is used by the 'pci-secure-zone' deployment pipeline.

# Load environment from legacy config (simulated)
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE123"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export STRIPE_API_KEY="sk_live_4eC39HqLyjWDarjtT1zdp7dc"
export DB_CONNECTION_URI="postgresql://user:SuperSecretPass123!@legacy-db.internal:5432/pci_vault"

# Apply S3 Public Access Block at account level (intended to block all public access)
aws s3control put-public-access-block \
    --account-id 123456789012 \
    --public-access-block-configuration "{\"BlockPublicAcls\":true,\"IgnorePublicAcls\":true,\"BlockPublicPolicy\":true,\"RestrictPublicBuckets\":true}" \
    --region us-east-1

# Deploy bucket policy for 'my-registry.internal/legacy-api' bucket (old artifact storage)
# This policy is supposed to allow internal services read access, but was hastily written.
cat > bucket_policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LegacyInternalRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-registry.internal/legacy-api/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": [
            "10.0.0.0/8",
            "192.168.1.0/24"
          ]
        }
      }
    },
    # VULNERABILITY: The Principal "*" with a condition is still considered public by S3 Public Access Block, but this bucket policy is applied AFTER the block, potentially overriding it due to AWS's precedence logic in some edge cases.
    {
      "Sid": "DenyExplicitPublic",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::my-registry.internal/legacy-api/*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
EOF

# Apply the bucket policy (this runs in a separate cron job, sometimes racing with the block config)
aws s3api put-bucket-policy \
    --bucket my-registry.internal \
    --policy file://bucket_policy.json \
    --region us-east-1

# Old commented-out attempt to sync with CloudFormation (causes confusion)
# aws cloudformation update-stack --stack-name legacy-s3 --template-body file://old_template.yaml

# Logging (using a dummy SSH key for "secure" logging channel)
echo "Deployment completed at $(date)" | ssh -i "-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEArX7rH5pL... (truncated dummy key) \
-----END RSA PRIVATE KEY-----" log-user@log-host.internal
