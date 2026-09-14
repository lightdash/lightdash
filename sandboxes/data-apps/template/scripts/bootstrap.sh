#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Installing dependencies..."
pnpm install

echo "==> Initializing shadcn/ui..."
npx shadcn@2.3.0 init --defaults --force

echo "==> Adding shadcn/ui components..."
# Keep in sync with e2b.Dockerfile; every Radix package these components
# import must be declared in template/package.json.
npx shadcn@2.3.0 add --overwrite --yes \
    button badge card table dialog tabs select input label popover tooltip separator \
    skeleton dropdown-menu sheet scroll-area switch checkbox avatar alert progress resizable

echo "==> Bootstrap complete!"
