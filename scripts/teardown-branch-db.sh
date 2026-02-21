#!/bin/bash
# Drops a branch database created by setup-branch-db.sh.
#
# Usage: ./scripts/teardown-branch-db.sh <branch-name>
set -e

RAW_BRANCH="${1:?Usage: ./scripts/teardown-branch-db.sh <branch-name>}"

if [[ "$RAW_BRANCH" =~ [^a-zA-Z0-9_-] ]]; then
  echo "Error: branch name '$RAW_BRANCH' contains invalid characters. Only a-z, A-Z, 0-9, _, - are allowed."
  exit 1
fi

BRANCH_DB="lightdash-${RAW_BRANCH}"

if ! psql -c "SELECT 1 FROM pg_database WHERE datname = '$BRANCH_DB'" | grep -q 1; then
  echo "Error: database '$BRANCH_DB' does not exist."
  exit 1
fi

echo "Dropping '$BRANCH_DB'..."
psql -c "DROP DATABASE \"$BRANCH_DB\""

echo "Done."
