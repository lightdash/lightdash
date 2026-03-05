#!/usr/bin/env bash
# Drops a branch database created by setup-branch-db.sh.
#
# Usage: ./scripts/teardown-branch-db.sh <branch-name>
set -e

BRANCH_NAME="${1:?Usage: ./scripts/teardown-branch-db.sh <branch-name>}"

if [[ "$BRANCH_NAME" =~ [^a-zA-Z0-9_-] ]]; then
  echo "Error: branch name '$BRANCH_NAME' contains invalid characters. Only a-z, A-Z, 0-9, _, - are allowed."
  exit 1
fi

# Use postgres admin db for all system queries (avoids PGDATABASE env override issues)
PSQL="psql -d postgres"

if ! $PSQL -c "SELECT 1 FROM pg_database WHERE datname = '$BRANCH_NAME'" | grep -q 1; then
  echo "Error: database '$BRANCH_NAME' does not exist."
  exit 1
fi

echo "Dropping '$BRANCH_NAME'..."
$PSQL -c "DROP DATABASE \"$BRANCH_NAME\""

echo "Done."
