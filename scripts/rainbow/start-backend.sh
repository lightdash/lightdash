#!/usr/bin/env bash
set -euo pipefail

cd packages/backend
if [[ -n "${GOOGLE_SHEETS_TEST_REFRESH_TOKEN:-}" ]]; then
    node --import tsx src/scripts/rainbow/googleGrant.ts seed
fi
unset GOOGLE_SHEETS_TEST_REFRESH_TOKEN
exec node --import tsx src/index.ts
