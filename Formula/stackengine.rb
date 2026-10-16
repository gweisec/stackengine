# Typed: false
# frozen_string_literal: true

# Formula/stackengine.rb
# Generated automatically by scripts/generate-homebrew-formula.sh
# Repository: https://github.com/gweisec/stackengine

class Stackengine < Formula
  desc "Zero-Trust Remediation Engine for Cloud-Native Ops"
  homepage "https://stackengine.dev"
  version "1.0.6"
  license "BUSL-1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/gweisec/stackengine/releases/download/v#{version}/stackengine_#{version}_darwin_arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256"
    elsif Hardware::CPU.intel?
      url "https://github.com/gweisec/stackengine/releases/download/v#{version}/stackengine_#{version}_darwin_amd64.tar.gz"
      sha256 "PLACEHOLDER_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/gweisec/stackengine/releases/download/v#{version}/stackengine_#{version}_linux_arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256"
    elsif Hardware::CPU.intel?
      url "https://github.com/gweisec/stackengine/releases/download/v#{version}/stackengine_#{version}_linux_amd64.tar.gz"
      sha256 "PLACEHOLDER_SHA256"
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
