#!/usr/bin/env bash
# Render Formula/hex-render.rb for the Homebrew tap, portbook-style: per-arch
# prebuilt binaries from the GitHub release, one sha256 each.
#
# Usage:
#   render-formula.sh <version> <sha_darwin_arm64> <sha_darwin_x64> \
#                     <sha_linux_arm64> <sha_linux_x64>
#
# Used by the release workflow and for the manual bootstrap of the first tag.
set -euo pipefail

VERSION="${1:?version}"
SHA_DARWIN_ARM64="${2:?}"; SHA_DARWIN_X64="${3:?}"
SHA_LINUX_ARM64="${4:?}"; SHA_LINUX_X64="${5:?}"
REPO="a-grasso/hexarch"
BASE="https://github.com/${REPO}/releases/download/v${VERSION}"

cat <<RB
class HexRender < Formula
  desc "Render a hexarch DSL file to an interactive architecture diagram"
  homepage "https://github.com/${REPO}"
  version "${VERSION}"
  if OS.mac?
    if Hardware::CPU.arm?
      url "${BASE}/hex-render-aarch64-apple-darwin.tar.xz"
      sha256 "${SHA_DARWIN_ARM64}"
    end
    if Hardware::CPU.intel?
      url "${BASE}/hex-render-x86_64-apple-darwin.tar.xz"
      sha256 "${SHA_DARWIN_X64}"
    end
  end
  if OS.linux?
    if Hardware::CPU.arm?
      url "${BASE}/hex-render-aarch64-unknown-linux-gnu.tar.xz"
      sha256 "${SHA_LINUX_ARM64}"
    end
    if Hardware::CPU.intel?
      url "${BASE}/hex-render-x86_64-unknown-linux-gnu.tar.xz"
      sha256 "${SHA_LINUX_X64}"
    end
  end
  license "MIT"

  def install
    bin.install "hex-render"
  end

  test do
    assert_match "hex-render", shell_output("#{bin}/hex-render --help")
  end
end
RB
