#!/usr/bin/env bash
set -euo pipefail

# scripts/generate-homebrew-formula.sh
# Generates Formula/stackengine.rb from package.json version and release-assets/checksums.txt

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKSUMS_FILE="${ROOT_DIR}/release-assets/checksums.txt"
OUTPUT_FILE="${1:-${ROOT_DIR}/Formula/stackengine.rb}"

VERSION=$(node -p "require('${ROOT_DIR}/package.json').version")
REPO="gweisec/stackengine"

echo "🍺 Generating Homebrew Formula for ${REPO} v${VERSION}..."

get_sha256() {
  local filename="$1"
  local sha=""
  if [[ -f "${CHECKSUMS_FILE}" ]]; then
    sha=$(grep -F "${filename}" "${CHECKSUMS_FILE}" | awk '{print $1}' || true)
  fi

  if [[ -z "${sha}" && -f "${ROOT_DIR}/release-assets/${filename}" ]]; then
    if command -v sha256sum &> /dev/null; then
      sha=$(sha256sum "${ROOT_DIR}/release-assets/${filename}" | awk '{print $1}')
    elif command -v shasum &> /dev/null; then
      sha=$(shasum -a 256 "${ROOT_DIR}/release-assets/${filename}" | awk '{print $1}')
    fi
  fi

  if [[ -z "${sha}" ]]; then
    echo "PLACEHOLDER_SHA256"
  else
    echo "${sha}"
  fi
}

SHA_DARWIN_ARM64=$(get_sha256 "stackengine_${VERSION}_darwin_arm64.tar.gz")
SHA_DARWIN_AMD64=$(get_sha256 "stackengine_${VERSION}_darwin_amd64.tar.gz")
SHA_LINUX_ARM64=$(get_sha256 "stackengine_${VERSION}_linux_arm64.tar.gz")
SHA_LINUX_AMD64=$(get_sha256 "stackengine_${VERSION}_linux_amd64.tar.gz")

mkdir -p "$(dirname "${OUTPUT_FILE}")"

cat <<EOF > "${OUTPUT_FILE}"
# Typed: false
# frozen_string_literal: true

# Formula/stackengine.rb
# Generated automatically by scripts/generate-homebrew-formula.sh
# Repository: https://github.com/${REPO}

class Stackengine < Formula
  desc "Zero-Trust Remediation Engine for Cloud-Native Ops"
  homepage "https://stackengine.dev"
  version "${VERSION}"
  license "BUSL-1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/${REPO}/releases/download/v#{version}/stackengine_#{version}_darwin_arm64.tar.gz"
      sha256 "${SHA_DARWIN_ARM64}"
    elsif Hardware::CPU.intel?
      url "https://github.com/${REPO}/releases/download/v#{version}/stackengine_#{version}_darwin_amd64.tar.gz"
      sha256 "${SHA_DARWIN_AMD64}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/${REPO}/releases/download/v#{version}/stackengine_#{version}_linux_arm64.tar.gz"
      sha256 "${SHA_LINUX_ARM64}"
    elsif Hardware::CPU.intel?
      url "https://github.com/${REPO}/releases/download/v#{version}/stackengine_#{version}_linux_amd64.tar.gz"
      sha256 "${SHA_LINUX_AMD64}"
    end
  end

  def install
    bin.install "stackengine"
    bin.install_symlink bin/"stackengine" => "se"
  end

  test do
    assert_match "stackengine", shell_output("#{bin}/stackengine --help")
    assert_match version.to_s, shell_output("#{bin}/stackengine --version")
  end
end
EOF

chmod +x "${OUTPUT_FILE}" || true
echo "✅ Formula written to: ${OUTPUT_FILE}"
