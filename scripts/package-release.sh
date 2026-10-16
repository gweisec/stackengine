#!/usr/bin/env bash
set -euo pipefail

# scripts/package-release.sh
# Packages compiled binaries into standardized tarballs/zip with checksums.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_BIN_DIR="${ROOT_DIR}/dist-bin"
OUTPUT_DIR="${ROOT_DIR}/release-assets"

VERSION=$(node -p "require('${ROOT_DIR}/package.json').version")

echo "📦 Packaging StackEngine Release v${VERSION}..."
rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Targets to package if binary exists in dist-bin
TARGETS=(
  "linux_amd64:stackengine-linux-amd64:tar.gz"
  "linux_arm64:stackengine-linux-arm64:tar.gz"
  "darwin_arm64:stackengine-darwin-arm64:tar.gz"
  "darwin_amd64:stackengine-darwin-amd64:tar.gz"
  "windows_amd64:stackengine-windows-amd64.exe:zip"
)

TMP_STAGE="${OUTPUT_DIR}/.stage"
rm -rf "${TMP_STAGE}"
mkdir -p "${TMP_STAGE}"

for TARGET in "${TARGETS[@]}"; do
  IFS=":" read -r PLATFORM BIN_NAME EXT <<< "${TARGET}"
  SRC_BIN="${DIST_BIN_DIR}/${BIN_NAME}"

  if [[ ! -f "${SRC_BIN}" ]]; then
    echo "⚠️  Skipping ${PLATFORM}: binary not found at ${SRC_BIN}"
    continue
  fi

  ARCHIVE_NAME="stackengine_${VERSION}_${PLATFORM}"
  STAGE_DIR="${TMP_STAGE}/${ARCHIVE_NAME}"
  mkdir -p "${STAGE_DIR}"

  if [[ "${PLATFORM}" == *"windows"* ]]; then
    cp "${SRC_BIN}" "${STAGE_DIR}/stackengine.exe"
    cp "${SRC_BIN}" "${STAGE_DIR}/se.exe"
  else
    cp "${SRC_BIN}" "${STAGE_DIR}/stackengine"
    chmod +x "${STAGE_DIR}/stackengine"
    ln -sf "stackengine" "${STAGE_DIR}/se"
  fi

  # Copy documentation and legal licenses
  [[ -f "${ROOT_DIR}/LICENSE" ]] && cp "${ROOT_DIR}/LICENSE" "${STAGE_DIR}/"
  [[ -f "${ROOT_DIR}/README.md" ]] && cp "${ROOT_DIR}/README.md" "${STAGE_DIR}/"

  FINAL_ARCHIVE="${OUTPUT_DIR}/${ARCHIVE_NAME}.${EXT}"
  if [[ "${EXT}" == "tar.gz" ]]; then
    tar -czf "${FINAL_ARCHIVE}" -C "${TMP_STAGE}" "${ARCHIVE_NAME}"
  else
    (cd "${TMP_STAGE}" && zip -qr "${FINAL_ARCHIVE}" "${ARCHIVE_NAME}")
  fi

  echo "✅ Created ${FINAL_ARCHIVE}"
done

rm -rf "${TMP_STAGE}"

# Generate SHA-256 Checksums
if compgen -G "${OUTPUT_DIR}/*.tar.gz" > /dev/null || compgen -G "${OUTPUT_DIR}/*.zip" > /dev/null; then
  echo "🔒 Calculating SHA-256 Checksums..."
  (
    cd "${OUTPUT_DIR}"
    if command -v sha256sum &> /dev/null; then
      sha256sum *.tar.gz *.zip 2>/dev/null > checksums.txt || true
    elif command -v shasum &> /dev/null; then
      shasum -a 256 *.tar.gz *.zip 2>/dev/null > checksums.txt || true
    fi
  )
  echo "📋 Generated ${OUTPUT_DIR}/checksums.txt"
fi

echo "🎉 Packaging completed successfully in ${OUTPUT_DIR}."
