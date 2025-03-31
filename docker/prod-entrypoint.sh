#!/bin/bash
set -e

# Migrate db
pnpm -F backend migrate-production

# Run prod
exec "$@"
