#!/usr/bin/env bash
# Cross-compile the hex-render binary for every release target with Bun and
# package portbook-style .tar.xz artifacts into out/. Run from the repo root
# after the embed module is generated.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf out build && mkdir -p out
# bun target -> release triple (matches the tap formula)
targets=(
  "bun-darwin-arm64:aarch64-apple-darwin"
  "bun-darwin-x64:x86_64-apple-darwin"
  "bun-linux-arm64:aarch64-unknown-linux-gnu"
  "bun-linux-x64:x86_64-unknown-linux-gnu"
)
for entry in "${targets[@]}"; do
  bt="${entry%%:*}"; triple="${entry##*:}"
  work="build/$triple"; mkdir -p "$work"
  echo "building $triple ..."
  bun build cli/index.ts --compile --minify --sourcemap=none \
    --target="$bt" --outfile "$work/hex-render" >/dev/null
  cp LICENSE README.md "$work/"
  tar -C "$work" -cJf "out/hex-render-${triple}.tar.xz" .
done
( cd out && sha256sum *.tar.xz | tee SHA256SUMS )
