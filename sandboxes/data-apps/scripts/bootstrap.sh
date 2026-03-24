#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# In the monorepo, package.json uses "workspace:*" for @lightdash/query-sdk.
# pnpm can't resolve that outside the workspace, so we temporarily rewrite it
# to a local link. In standalone environments (E2B) the version is already a
# real semver range, so this is a no-op.
QUERY_SDK_DIR="$PROJECT_DIR/../../packages/query-sdk"
if grep -q '"workspace:\*"' package.json && [ -d "$QUERY_SDK_DIR" ]; then
    echo "==> Rewriting workspace:* → link: for @lightdash/query-sdk..."
    sed -i.bak 's|"workspace:\*"|"link:../../packages/query-sdk"|' package.json
    RESTORE_PKG_JSON=true
else
    RESTORE_PKG_JSON=false
fi

# Create a temporary pnpm-workspace.yaml so pnpm treats this directory as its
# own workspace root instead of walking up to the monorepo. This also prevents
# shadcn's internal `pnpm add` calls from touching the monorepo lockfile.
echo "packages: []" > pnpm-workspace.yaml

cleanup() {
    rm -f pnpm-workspace.yaml
    if [ "$RESTORE_PKG_JSON" = true ]; then
        mv -f package.json.bak package.json
    fi
}
trap cleanup EXIT

echo "==> Installing dependencies..."
pnpm install

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
