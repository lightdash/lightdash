#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Installing dependencies..."
pnpm install --ignore-workspace

# Create a temporary pnpm-workspace.yaml so shadcn's internal
# `pnpm add` calls don't walk up to the monorepo root.
echo "packages: []" > pnpm-workspace.yaml
trap 'rm -f pnpm-workspace.yaml' EXIT

echo "==> Initializing shadcn/ui..."
npx shadcn@2.3.0 init --defaults --force

echo "==> Adding shadcn/ui components..."
npx shadcn@2.3.0 add --overwrite --yes \
    button \
    badge \
    card \
    table \
    dialog \
    tabs \
    select \
    input \
    label \
    popover \
    tooltip \
    separator

echo "==> Bootstrap complete!"
