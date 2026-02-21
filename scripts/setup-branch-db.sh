#!/bin/bash
# Creates a branch database by copying from lightdash-template.
# Database name: lightdash-<branch-name> (only a-z, A-Z, 0-9, _, - allowed)
#
# Usage: ./scripts/setup-branch-db.sh <branch-name>
set -e

TEMPLATE_DB="lightdash-template"

RAW_BRANCH="${1:?Usage: ./scripts/setup-branch-db.sh <branch-name>}"

# Validate: only allow alphanumeric, hyphens, and underscores
if [[ "$RAW_BRANCH" =~ [^a-zA-Z0-9_-] ]]; then
  echo "Error: branch name '$RAW_BRANCH' contains invalid characters. Only a-z, A-Z, 0-9, _, - are allowed."
  exit 1
fi

BRANCH_DB="lightdash-${RAW_BRANCH}"

# Check template exists
psql -c "SELECT 1 FROM pg_database WHERE datname = '$TEMPLATE_DB'" \
  | grep -q 1 || { echo "Error: template database '$TEMPLATE_DB' not found. Run ./scripts/setup-template-db.sh first."; exit 1; }

# Drop existing branch db if it exists
if psql -c "SELECT 1 FROM pg_database WHERE datname = '$BRANCH_DB'" | grep -q 1; then
  echo "Dropping existing '$BRANCH_DB'..."
  psql -c "DROP DATABASE \"$BRANCH_DB\""
fi

echo "Creating '$BRANCH_DB' from template '$TEMPLATE_DB'..."
psql -c "CREATE DATABASE \"$BRANCH_DB\" TEMPLATE $TEMPLATE_DB"

echo "Done — branch database '$BRANCH_DB' is ready."
