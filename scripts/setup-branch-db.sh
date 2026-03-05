#!/usr/bin/env bash
# Creates a branch database by copying from lightdash_template.
# Database name: <branch-name> (only a-z, A-Z, 0-9, _, - allowed)
#
# Usage: ./scripts/setup-branch-db.sh <branch-name>
set -e

TEMPLATE_DB="lightdash_template"

BRANCH_NAME="${1:?Usage: ./scripts/setup-branch-db.sh <branch-name>}"

# Validate: only allow alphanumeric, hyphens, and underscores
if [[ "$BRANCH_NAME" =~ [^a-zA-Z0-9_-] ]]; then
  echo "Error: branch name '$BRANCH_NAME' contains invalid characters. Only a-z, A-Z, 0-9, _, - are allowed."
  exit 1
fi

# Use postgres admin db for all system queries (avoids PGDATABASE env override issues)
PSQL="psql -d postgres"

# Check template exists
$PSQL -c "SELECT 1 FROM pg_database WHERE datname = '$TEMPLATE_DB'" \
  | grep -q 1 || { echo "Error: template database '$TEMPLATE_DB' not found. Run ./scripts/setup-template-db.sh first."; exit 1; }

# Drop existing branch db if it exists
if $PSQL -c "SELECT 1 FROM pg_database WHERE datname = '$BRANCH_NAME'" | grep -q 1; then
  echo "Dropping existing '$BRANCH_NAME'..."
  $PSQL -c "DROP DATABASE \"$BRANCH_NAME\""
fi

echo "Creating '$BRANCH_NAME' from template '$TEMPLATE_DB'..."
$PSQL -c "CREATE DATABASE \"$BRANCH_NAME\" TEMPLATE $TEMPLATE_DB"

echo "Done — branch database '$BRANCH_NAME' is ready."
