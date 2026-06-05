#!/bin/bash
set -euo pipefail

# Remove tsbuildinfo files (incl. nested workspace members)
find packages -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete

# Remove turbo cache/logs from this worktree and nested package dirs.
rm -rf .turbo
rm -rf packages/*/.turbo

# In git worktrees, Turbo uses the primary checkout's .turbo/cache.
git_common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
if [[ -n "$git_common_dir" ]]; then
    rm -rf "$(dirname "$git_common_dir")/.turbo"
fi

# Remove build/dist/.next under packages (incl. nested workspace members)
find packages -type d \( -name node_modules -prune \) -o \
    -type d \( -name dist -o -name build -o -name .next \) -prune -print0 | \
    xargs -0 rm -rf

echo "🧼 cleaned \"build\", \"dist\", \".turbo\" and \"tsbuildinfo\" files"
