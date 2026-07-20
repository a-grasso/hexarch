#!/usr/bin/env bash
# hex-render installer. Downloads the prebuilt binary for this platform from the
# latest GitHub release and drops it on your PATH. Idempotent - re-run to update.
#
#   curl -fsSL https://raw.githubusercontent.com/a-grasso/hexarch/main/install.sh | bash
#
# Overrides: BIN_DIR (default ~/.local/bin), HEXARCH_VERSION (default: latest).
set -euo pipefail

REPO="a-grasso/hexarch"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) os="apple-darwin" ;;
  Linux)  os="unknown-linux-gnu" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch="aarch64" ;;
  x86_64|amd64)  arch="x86_64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac
triple="${arch}-${os}"

if [ -n "${HEXARCH_VERSION:-}" ]; then
  tag="v${HEXARCH_VERSION#v}"
else
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -m1 '"tag_name"' | cut -d'"' -f4)"
fi
[ -n "$tag" ] || { echo "could not determine latest release" >&2; exit 1; }

url="https://github.com/${REPO}/releases/download/${tag}/hex-render-${triple}.tar.xz"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "downloading hex-render ${tag} (${triple})..."
curl -fsSL "$url" -o "$tmp/hex.tar.xz"
tar -C "$tmp" -xJf "$tmp/hex.tar.xz"

mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/hex-render" "$BIN_DIR/hex-render"
echo "installed $BIN_DIR/hex-render"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: $BIN_DIR is not on your PATH - add it to your shell profile." >&2 ;;
esac
