#!/usr/bin/env bash
# Computes a short content hash of every file that determines the contents of
# the preview database (dbt demo project, knex migrations, and seeds). The
# preview DB VolumeSnapshot is named jaffle-seed-<hash>, so a PR whose base
# commit has the same hash can clone the snapshot instead of seeding at boot.
# Keep the path list in sync with the db_seed filter in
# .github/file-filters.yml and .github/workflows/preview-db-snapshot.yml.
set -euo pipefail

REF="${1:?usage: compute-db-hash.sh <git-ref>}"

git ls-tree -r "$REF" -- \
    examples/full-jaffle-shop-demo/dbt \
    examples/full-jaffle-shop-demo/profiles \
    packages/backend/src/database/migrations \
    packages/backend/src/database/seeds \
    packages/backend/src/ee/database/migrations \
    packages/backend/src/ee/database/seeds \
    | sha256sum | cut -c1-12
