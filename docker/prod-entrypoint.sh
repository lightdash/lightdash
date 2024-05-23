#!/bin/bash
set -e

# Migrate db
# yarn workspace backend migrate-production

# Run prod
exec "$@"
