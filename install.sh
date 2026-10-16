#!/usr/bin/env bash
#
# StackEngine One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/gweisec/stackengine/main/install.sh | sh
#

set -euo pipefail

REPO="gweisec/stackengine"
APP_NAME="stackengine"
ALIAS_NAME="se"

printf "\n\033[36m============================================================\033[0m\n"
printf "\033[1;36m  STACKENGINE CLI INSTALLER\033[0m\n"
printf "\033[36m============================================================\033[0m\n\n"

# 1. Detect OS
OS_RAW="$(uname -s)"
case "${OS_RAW}" in
  Linux*)   OS="linux" ;;
  Darwin*)  OS="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  *)
    printf "\033[31m[ERROR] Unsupported Operating System: %s\033[0m\n" "${OS_RAW}"
    exit 1
    ;;
esac

# 2. Detect CPU Architecture
ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
  x86_64|amd64)   ARCH="amd64" ;;
  aarch64|arm64)  ARCH="arm64" ;;
  *)
    printf "\033[31m[ERROR] Unsupported CPU Architecture: %s\033[0m\n" "${ARCH_RAW}"
    exit 1
    ;;
esac

printf "[SYSTEM] Detected platform: \033[32m%s_%s\033[0m\n" "${OS}" "${ARCH}"

# 3. Determine latest release version
printf "[GITHUB] Fetching latest release metadata from %s...\n" "${REPO}"
LATEST_TAG=""
if command -v curl &>/dev/null; then
  LATEST_TAG=$(curl -sSf "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || true)
fi

if [[ -z "${LATEST_TAG}" ]]; then
  # Fallback: query git tags if available or default
  LATEST_TAG="v1.0.6"
  printf "[WARN] Could not retrieve latest release via API. Falling back to %s\n" "${LATEST_TAG}"
fi

VERSION="${LATEST_TAG#v}"
EXTENSION="tar.gz"
if [[ "${OS}" == "windows" ]]; then
  EXTENSION="zip"
fi

TARBALL_NAME="stackengine_${VERSION}_${OS}_${ARCH}.${EXTENSION}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${TARBALL_NAME}"

printf "[DOWNLOAD] Fetching \033[36m%s\033[0m (%s)...\n" "${TARBALL_NAME}" "${LATEST_TAG}"

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'stackengine')"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

# 4. Download archive
if command -v curl &>/dev/null; then
  curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_DIR}/${TARBALL_NAME}"
elif command -v wget &>/dev/null; then
  wget -qO "${TMP_DIR}/${TARBALL_NAME}" "${DOWNLOAD_URL}"
else
  printf "\033[31m[ERROR] Neither curl nor wget is available. Please install one to continue.\033[0m\n"
  exit 1
fi

# 5. Extract archive
printf "[EXTRACT] Unpacking binary...\n"
if [[ "${EXTENSION}" == "tar.gz" ]]; then
  tar -xzf "${TMP_DIR}/${TARBALL_NAME}" -C "${TMP_DIR}"
else
  unzip -qo "${TMP_DIR}/${TARBALL_NAME}" -d "${TMP_DIR}"
fi

EXTRACTED_DIR="${TMP_DIR}/stackengine_${VERSION}_${OS}_${ARCH}"
if [[ ! -d "${EXTRACTED_DIR}" ]]; then
  EXTRACTED_DIR="${TMP_DIR}"
fi

# 6. Determine Target Directory
INSTALL_DIR="/usr/local/bin"
USE_SUDO=false

if [[ -w "${INSTALL_DIR}" ]]; then
  TARGET_DIR="${INSTALL_DIR}"
elif command -v sudo &>/dev/null && [ -t 0 ]; then
  TARGET_DIR="${INSTALL_DIR}"
  USE_SUDO=true
else
  TARGET_DIR="${HOME}/.local/bin"
  mkdir -p "${TARGET_DIR}"
fi

BIN_SRC="${EXTRACTED_DIR}/${APP_NAME}"
if [[ "${OS}" == "windows" ]]; then
  BIN_SRC="${EXTRACTED_DIR}/${APP_NAME}.exe"
  TARGET_BIN="${TARGET_DIR}/${APP_NAME}.exe"
  TARGET_ALIAS="${TARGET_DIR}/${ALIAS_NAME}.exe"
  cp "${BIN_SRC}" "${TARGET_BIN}"
  cp "${BIN_SRC}" "${TARGET_ALIAS}"
else
  TARGET_BIN="${TARGET_DIR}/${APP_NAME}"
  TARGET_ALIAS="${TARGET_DIR}/${ALIAS_NAME}"

  if [ "${USE_SUDO}" = true ]; then
    printf "[INSTALL] Installing to %s (requires sudo)...\n" "${TARGET_DIR}"
    sudo mv "${BIN_SRC}" "${TARGET_BIN}"
    sudo chmod +x "${TARGET_BIN}"
    sudo ln -sf "${TARGET_BIN}" "${TARGET_ALIAS}"
  else
    printf "[INSTALL] Installing to user directory: %s...\n" "${TARGET_DIR}"
    mv "${BIN_SRC}" "${TARGET_BIN}"
    chmod +x "${TARGET_BIN}"
    ln -sf "${TARGET_BIN}" "${TARGET_ALIAS}"
  fi
fi

printf "\n\033[32m✔ SUCCESS: StackEngine %s installed successfully!\033[0m\n\n" "${LATEST_TAG}"
printf "[EXECUTABLE] %s\n" "${TARGET_BIN}"
printf "[ALIAS]      %s\n\n" "${TARGET_ALIAS}"

# Verify PATH presence
if [[ ":$PATH:" != *":${TARGET_DIR}:"* ]]; then
  printf "\033[33m[NOTICE] %s is not currently in your \$PATH.\033[0m\n" "${TARGET_DIR}"
  printf "Add it to your profile (e.g., ~/.bashrc or ~/.zshrc):\n"
  printf "    export PATH=\"%s:\$PATH\"\n\n" "${TARGET_DIR}"
fi

printf "Get started immediately by starting your local privacy AI gateway:\n"
printf "    \033[36m%s proxy --port 8080\033[0m\n\n" "${ALIAS_NAME}"
