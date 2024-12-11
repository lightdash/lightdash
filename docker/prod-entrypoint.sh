#!/bin/bash
set -e

# Migrate db
pnpm --filter backend migrate-production

# Run prod
exec "$@"
