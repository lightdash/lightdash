#!/usr/bin/env bash
set -euo pipefail

cd packages/backend
if [[ -n "${GOOGLE_SHEETS_TEST_REFRESH_TOKEN:-}" ]] &&
    ! timeout --kill-after=2s 10s node --import tsx src/scripts/rainbow/googleGrant.ts seed; then
    echo 'Rainbow Google Sheets grant seed failed. Continuing backend startup.' >&2
fi
unset GOOGLE_SHEETS_TEST_REFRESH_TOKEN
exec node --import tsx src/index.ts
