#!/usr/bin/env bash
# T3 Code worktree setup (t3.json): install deps, build backend/frontend dependency packages.
set -euo pipefail
cd "$(dirname "$0")/.."

install=(pnpm install --frozen-lockfile --prefer-offline)
if command -v sfw >/dev/null; then
    install=(sfw "${install[@]}")
fi
"${install[@]}"

pnpm exec turbo run build --filter=backend^... --filter=@lightdash/frontend^...
