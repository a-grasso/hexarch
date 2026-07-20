#!/usr/bin/env bash
# Install hexarch: the `hexarch` agent-skill AND the `hex-render` renderer,
# together. Self-bootstrapping and idempotent (same model as visual-plans):
#
#   # once public — one-liner from anywhere:
#   curl -fsSL https://raw.githubusercontent.com/a-grasso/hexarch/main/install.sh | bash
#
#   # from a local checkout:
#   ./install.sh                    # skill user-GLOBAL (~/.claude/skills) + CLI on PATH
#   ./install.sh --project ~/repo   # skill into one project's .claude/skills + CLI on PATH
#   ./install.sh --skill-only       # just the skill
#   ./install.sh --cli-only         # just the renderer
#
# The renderer is built from source when Bun + npm are available (source-matched,
# and symlinked so a rebuild updates it); otherwise the prebuilt binary for this
# platform is downloaded from the latest GitHub release.
#
# Env overrides:
#   HEXARCH_SRC    use this existing checkout instead of cloning
#   HEXARCH_HOME   clone location (default ~/.local/share/hexarch)
#   SKILLS_DIR     global skills dir (default ~/.claude/skills)
#   BIN_DIR        where the CLI is linked (default ~/.local/bin)
set -euo pipefail

REPO="a-grasso/hexarch"
REPO_SSH="git@github.com:${REPO}.git"
REPO_HTTPS="https://github.com/${REPO}.git"
CLONE_DIR="${HEXARCH_HOME:-$HOME/.local/share/hexarch}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.claude/skills}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
SKILLS=(hexarch)   # skills shipped by this repo

# --- args ---
MODE="global"; PROJECT=""; DO_SKILL=1; DO_CLI=1
while [ $# -gt 0 ]; do
  case "$1" in
    --project|-p) MODE="project"; PROJECT="${2:-}"; shift 2 ;;
    --global) MODE="global"; shift ;;
    --skill-only) DO_CLI=0; shift ;;
    --cli-only) DO_SKILL=0; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# --- resolve source checkout (existing checkout, this checkout, or clone) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "${HEXARCH_SRC:-}" ]; then
  SRC="$(cd "$HEXARCH_SRC" && pwd)"
elif [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/skills" ] && [ -d "$SCRIPT_DIR/cli" ]; then
  SRC="$SCRIPT_DIR"
elif [ -d "$CLONE_DIR/.git" ]; then
  echo "▸ updating $CLONE_DIR"; git -C "$CLONE_DIR" pull --ff-only; SRC="$CLONE_DIR"
else
  echo "▸ cloning into $CLONE_DIR"
  git clone --depth 1 "$REPO_SSH" "$CLONE_DIR" 2>/dev/null \
    || git clone --depth 1 "$REPO_HTTPS" "$CLONE_DIR"
  SRC="$CLONE_DIR"
fi
echo "▸ source: $SRC"

# --- skill(s) ---
link_skills() {  # $1 = destination .claude/skills dir
  mkdir -p "$1"
  for s in "${SKILLS[@]}"; do
    ln -sfn "$SRC/skills/$s" "$1/$s"
    echo "  linked $1/$s -> skills/$s"
  done
}
if [ "$DO_SKILL" = 1 ]; then
  echo "▸ installing skill(s): ${SKILLS[*]}"
  if [ "$MODE" = "project" ]; then
    [ -n "$PROJECT" ] || { echo "--project needs a path" >&2; exit 2; }
    dest="$(cd "$PROJECT" && pwd)/.claude/skills"
    link_skills "$dest"
    # keep the machine-specific symlinks out of the project's history
    gi="$(cd "$PROJECT" && pwd)/.gitignore"
    for s in "${SKILLS[@]}"; do
      line=".claude/skills/$s"
      grep -qxF "$line" "$gi" 2>/dev/null || echo "$line" >> "$gi"
    done
  else
    link_skills "$SKILLS_DIR"
  fi
fi

# --- renderer (hex-render) ---
install_cli() {
  mkdir -p "$BIN_DIR"
  if command -v bun >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    echo "▸ building hex-render from source (bun + npm found)"
    ( cd "$SRC"
      npm install --silent
      npm run build:embed -w viewer >/dev/null
      bun run cli/scripts/gen-embed.ts >/dev/null
      mkdir -p dist
      ( cd cli && bun build ./index.ts --compile --minify --outfile ../dist/hex-render >/dev/null )
    )
    ln -sfn "$SRC/dist/hex-render" "$BIN_DIR/hex-render"
    echo "  linked $BIN_DIR/hex-render -> dist/hex-render"
  else
    echo "▸ downloading prebuilt hex-render (no bun/npm toolchain found)"
    case "$(uname -s)" in
      Darwin) os="apple-darwin" ;; Linux) os="unknown-linux-gnu" ;;
      *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
    esac
    case "$(uname -m)" in
      arm64|aarch64) arch="aarch64" ;; x86_64|amd64) arch="x86_64" ;;
      *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
    esac
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep -m1 '"tag_name"' | cut -d'"' -f4)"
    [ -n "$tag" ] || { echo "could not determine latest release" >&2; exit 1; }
    url="https://github.com/${REPO}/releases/download/${tag}/hex-render-${arch}-${os}.tar.xz"
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
    curl -fsSL "$url" -o "$tmp/hex.tar.xz"
    tar -C "$tmp" -xJf "$tmp/hex.tar.xz"
    install -m 0755 "$tmp/hex-render" "$BIN_DIR/hex-render"
    echo "  installed $BIN_DIR/hex-render ($tag)"
  fi
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "note: $BIN_DIR is not on your PATH - add it to your shell profile." >&2 ;;
  esac
}
[ "$DO_CLI" = 1 ] && install_cli

echo "✓ done."
[ "$DO_SKILL" = 1 ] && echo "  skill 'hexarch' is available to Claude Code."
[ "$DO_CLI" = 1 ] && echo "  run: hex-render <spec.hexarch.yaml>"
