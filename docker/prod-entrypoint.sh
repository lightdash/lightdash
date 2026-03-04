#!/bin/bash
set -e

# Migrate db (skip if SKIP_MIGRATIONS is set)
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    pnpm -F backend migrate-production
fi

# Run prod
exec "$@"
