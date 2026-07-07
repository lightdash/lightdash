# Preview DB seed snapshots

Preview environments used to spend 6–9 minutes at boot seeding the database
(dbt seed/run of the jaffle shop demo + rolling back and re-running ~500 knex
migrations). Instead, we maintain a pre-seeded Postgres volume as an Okteto
[VolumeSnapshot](https://www.okteto.com/docs/core/use-volume-snapshots/) and
preview DB volumes are cloned from it at deploy time, so boot only applies the
PR's new migrations.

## How it works

1. `.github/workflows/preview-db-snapshot.yml` runs when seed/db files change
   on `main`. It seeds a source Postgres (PVC `preview-seed-db` in the
   `preview-seed` Okteto namespace) and snapshots it as `jaffle-seed-<hash>`,
   where `<hash>` is a content hash of the seed/db files
   (`compute-db-hash.sh`). Old snapshots are garbage collected (last 5 kept).
2. The `preview` job in `pr.yml` computes the same hash from the PR's base
   commit and checks the snapshot exists. If it does — and the PR doesn't
   touch seed/db files (`db_seed` filter in `.github/file-filters.yml`) — it
   passes `SEED_MODE=snapshot` to the Okteto pipeline.
3. `okteto.preview.yaml` appends the `dev.okteto.com/from-snapshot-*` labels
   to the `pgdata` volume in `docker-compose.preview.yml`, so Okteto clones
   the volume from the snapshot instead of creating it empty.
4. `renderDeployHook.sh` sees `SEED_MODE=snapshot` and only runs
   `migrate-production` (applies the PR's new migrations). In `full` mode it
   behaves exactly as before (dbt seed/run + rollback-all + migrate + seed).

Every failure mode (snapshot missing, secrets unset, hash mismatch) falls back
to `SEED_MODE=full`, i.e. the old behaviour.

## Bootstrap checklist

1. **GitHub secret `PREVIEW_SEED_PGPASSWORD`** — password baked into the
   snapshot's PGDATA at initdb time.
2. **Okteto global variable `PREVIEW_SEED_PGPASSWORD`** (Admin → Variables) —
   must be the *same value*; previews cloning the snapshot authenticate with
   it. If the values ever diverge, delete the `preview-seed-db` PVC and re-run
   the builder so a fresh PGDATA is initialised.
3. **GitHub secret `LIGHTDASH_LICENSE_KEY`** — required so the builder runs the
   `src/ee/database` migrations/seeds, matching what previews apply at boot.
4. Run the **Preview DB Snapshot** workflow manually once
   (`workflow_dispatch`) to create the first snapshot. Until it exists, all
   previews use full-seed mode.
5. Confirm with the Okteto team that preview namespaces (`pr-*`) are allowed
   to clone snapshots from the `preview-seed` namespace
   (`enableNamespaceAccessValidation` must be off, its default).

## Forcing a full seed

Add `full-seed` to the PR description and push — the next preview deploy runs
the full boot-time seed (rollback-all + migrate + seed + dbt). Use this if the
preview DB drifted, e.g. after amending a migration that the preview had
already applied. Deleting the preview environment in Okteto also resets it.

## Invariants to keep in sync

- The path list in `compute-db-hash.sh`, the `db_seed` filter in
  `.github/file-filters.yml`, and the `paths:` trigger in
  `preview-db-snapshot.yml`.
- The Postgres image + data mount in `postgres.yaml` and the `db-preview`
  service in `docker-compose.preview.yml` (snapshots are raw PGDATA — the
  Postgres major version must match, and Postgres 18+ keeps PGDATA under
  `/var/lib/postgresql`, not `/var/lib/postgresql/data`).
- The `volumes:` block must stay at the very end of
  `docker-compose.preview.yml` — `okteto.preview.yaml` appends the snapshot
  labels to the file.
