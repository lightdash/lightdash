#!/usr/bin/env bash
# T3 Code worktree setup (t3.json): copy untracked local files, install deps, build backend/frontend deps.
set -euo pipefail
cd "$(dirname "$0")/.."

main="${T3CODE_PROJECT_ROOT:-}"
if [[ -n "$main" && "$main" != "$PWD" ]]; then
    for file in .envrc .env.development.local CLAUDE.local.md; do
        if [[ -f "$main/$file" && ! -e "$file" ]]; then
            cp "$main/$file" "$file"
        fi
    done
fi
if [[ -f .envrc ]] && command -v direnv >/dev/null; then
    direnv allow .
fi

install=(pnpm install --frozen-lockfile --prefer-offline)
if command -v sfw >/dev/null; then
    install=(sfw "${install[@]}")
fi
"${install[@]}"

pnpm exec turbo run build --filter=backend^... --filter=@lightdash/frontend^...
