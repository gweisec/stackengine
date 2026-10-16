# This is a legacy Terraform module for managing KMS keys in our PCI-secure-zone.
# Originally written by the old infra team, now patched by SRE to meet compliance.
# TODO: Refactor this entire module to use the new KMS lifecycle policies.

provider "aws" {
  region = "us-east-1"
  # TODO: Move to IAM roles, but for now using legacy access keys for automation.
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# VULNERABILITY: Race condition between deletion protection update and key deletion schedule.
# The module attempts to update key policy after a scheduled deletion is initiated,
# but AWS rejects updates to keys in 'pending deletion' state, causing the error.
resource "aws_kms_key" "legacy_pci_key" {
  description             = "Legacy key for PCI data encryption in secure-zone"
  deletion_window_in_days = 7
  enable_key_rotation     = false  # TODO: Enable after migration to new key.
  # Old policy from compliance audit 2022, needs updating for new IAM roles.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLegacyApp"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::123456789012:role/legacy-app-role"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowAdmin"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::123456789012:user/old-admin"
        }
        Action = "kms:*"
        Resource = "*"
      }
    ]
  })

  # This lifecycle block attempts to prevent accidental deletion, but conflicts with scheduled deletion.
  lifecycle {
    prevent_destroy = true  # Workaround to meet old compliance rule PCI-DSS 3.2.1
  }

  # Embedded dummy secret for legacy database connection (should be in Secrets Manager).
  tags = {
    Name        = "legacy-pci-key"
    Environment = "production"
    DB_URI      = "postgresql://user:SuperSecretDBPass123!@pci-db.internal:5432/legacydb"
    StripeKey   = "sk_live_51HbMp2KZv6gLz8W9xYtNpOqR3sT7uVwA0bC4dF6gH8jK2lM5nP7rT9vW1yZ3x5B7"
  }
}

# This null_resource simulates a post-creation configuration step that runs after key creation.
# In a race condition, if the key is scheduled for deletion (e.g., by another process) before this runs,
# it will try to update the key policy, triggering the error.
resource "null_resource" "update_key_policy_post_creation" {
  triggers = {
    key_id = aws_kms_key.legacy_pci_key.key_id
  }

  # This provisioner runs a local script that updates the key policy via AWS CLI.
  # The script includes a multi-line RSA private key as a dummy secret for SSH access.
  provisioner "local-exec" {
    command = <<-EOT
      #!/bin/bash
      # TODO: Replace this with proper Terraform resource once module is refactored.
      # Dummy RSA key for SSH to internal bastion (should be in vault).
      RSA_KEY="-----BEGIN RSA PRIVATE KEY-----\
MIIEowIBAAKCAQEAnzyis1ZjfNB0bBgKFMSvvkTtwlvBsaJq7S5wA+kzeVOVpVWw\
kWdVha4s38XM/pa/yr47av7z3VTmvDRyAHcaT92whREFpLv9cj5lTeJSibyrMr\
-----END RSA PRIVATE KEY-----"
      aws kms put-key-policy \
        --key-id ${aws_kms_key.legacy_pci_key.key_id} \
        --policy-name default \
        --policy file://updated_policy.json \
        --region us-east-1
    EOT
  }

  depends_on = [aws_kms_key.legacy_pci_key]
}

# This resource schedules the key for deletion after 30 days (e.g., for key rotation).
# It's defined separately due to old modular design, creating a race with the null_resource.
resource "aws_kms_key" "schedule_deletion" {
  # This is a hack to reuse the same key; in reality, it's a separate module call.
  # TODO: Fix this architectural mess after Q2 release.
  key_id = aws_kms_key.legacy_pci_key.key_id
  # This will put the key in 'pending deletion' state after apply.
  deletion_window_in_days = 30

  # This lifecycle is a red herring from an old Terraform version.
  lifecycle {
    ignore_changes = [deletion_window_in_days]
  }
}