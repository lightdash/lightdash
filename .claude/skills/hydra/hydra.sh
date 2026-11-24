#!/usr/bin/env bash
# Runs hydra.ts against this checkout's backend code. The registry reads
# backend config on import, so the committed dev env files are loaded.
set -euo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root/packages/backend"
set -a
# shellcheck disable=SC1091
source "$root/.env" >/dev/null 2>&1
# shellcheck disable=SC1091
source "$root/.env.development" >/dev/null 2>&1
set +a
exec pnpm exec tsx "$root/.claude/skills/hydra/hydra.ts" "$@" 2> >(grep -v '^WARNING: Using http' >&2)
