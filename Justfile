# hexarch task aliases. `just` with no args lists them.
default:
    @just --list

# Install workspace dependencies.
setup:
    npm ci || npm install

# Dev server with hot-reload (multi-spec picker). Point at a folder with DIR=...
dev DIR="":
    HEXARCH_DIR="{{DIR}}" npm run dev -w viewer

# Build the embeddable single-file viewer and regenerate the CLI embed module.
embed:
    npm run build:embed -w viewer
    bun run cli/scripts/gen-embed.ts

# Compile the standalone hex-render binary for this machine (into dist/).
build: embed
    cd cli && bun build ./index.ts --compile --minify --outfile ../dist/hex-render
    @echo "built dist/hex-render"

# Run the CLI from source on a spec (no compile). e.g. just render examples/order-service.yaml
render FILE: embed
    bun run cli/index.ts "{{FILE}}"

# Live server from source. e.g. just serve examples/order-service.yaml
serve FILE: embed
    bun run cli/index.ts --serve "{{FILE}}"

# Typecheck viewer + CLI.
check: embed
    npm run typecheck -w viewer
    cd cli && npx tsc --noEmit

# Install a stable copy of the compiled binary to ~/.local/bin.
install: build
    install -m 0755 dist/hex-render "${HOME}/.local/bin/hex-render"
    @echo "installed ~/.local/bin/hex-render (copy)"

# Dev variant: symlink the on-PATH command to the repo build output, so a
# later `just build` updates the installed command with no reinstall step.
# Use this OR `install` OR brew - keep exactly one hex-render on PATH.
link: build
    ln -sfn "$(pwd)/dist/hex-render" "${HOME}/.local/bin/hex-render"
    @echo "linked ~/.local/bin/hex-render -> dist/hex-render"

# Tag and push a release (triggers .github/workflows/release.yml).
release VERSION:
    git tag "v{{VERSION}}"
    git push origin "v{{VERSION}}"
