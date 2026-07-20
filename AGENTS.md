# AGENTS.md

General repo guidance for humans and AI lives in `CLAUDE.md` (architecture, package commands, testing memories, code style). Read it first. The section below only covers what is specific to the Cursor Cloud VM.

## Cursor Cloud specific instructions

This VM runs Lightdash **natively (no Docker)**. Docker is not installed, so the
repo's `scripts/dev-fast-start.sh` and the `/docker-dev` flow do **not** apply here.
Infra (PostgreSQL, MinIO) runs as native processes; the app runs via PM2 exactly as
`ecosystem.config.js` defines. The update script only runs `pnpm install`; everything
below (starting Postgres/MinIO/PM2) is a per-session action you must do yourself.

### Node version (important gotcha)
The repo pins Node `20.19` (`.nvmrc`). The VM's `/exec-daemon/node` is Node 22 and sits
early in `PATH`, so it shadows nvm. This is worked around by symlinks in
`/usr/local/cargo/bin` (first in `PATH`) pointing at nvm's `v20.19.6` binaries, so `node`
resolves to 20.19.6 in every context (including non-interactive shells and PM2). If `node -v`
ever reports v22, recreate the symlink: `ln -sf "$HOME/.nvm/versions/node/v20.19.6/bin/node" /usr/local/cargo/bin/node`.
`node_modules` native addons are built for Node 20 — keep install and runtime on the same version.

### Start everything (per session)
Postgres and MinIO are not auto-started on VM boot, and PM2 is not resurrected. Run:

```bash
# 1. PostgreSQL (user: postgres / password: password, db: postgres, localhost:5432)
sudo service postgresql start

# 2. MinIO (S3) on :9000 (console :9001), buckets already created in ~/minio-data
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s minio \
  'MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin ~/.local/bin/minio server ~/minio-data --address :9000 --console-address :9001'

# 3. App stack (api, scheduler, frontend, common/warehouses/formula watchers, spotlight)
pnpm pm2:start
```

Then wait for `http://localhost:8080/api/v1/health` to return 200 (the backend runs TS via
`tsx`, ~15s cold start). Frontend (Vite): `http://localhost:3000`. Use `pnpm pm2:logs`,
`pnpm exec pm2 status`, `pnpm exec pm2 restart lightdash-api` to manage processes.

### Environment config
`.env.development.local` (gitignored; present on the VM / snapshot) overrides the Docker
hostnames in `.env.development` with native ones (`PGHOST=localhost`, `S3_ENDPOINT=http://localhost:9000`,
`SITE_URL=http://localhost:3000`, seeded PAT `LDPAT`, `ALLOW_MULTIPLE_ORGS=true`). PM2 loads
`.env.development` then `.env.development.local` (local wins).

### Database, dbt demo, and reset
- The DB is already migrated + seeded, and the Jaffle Shop demo warehouse tables are built in
  the `jaffle` schema. Test login: `demo@lightdash.com` / `demo_password!` (admin of "Jaffle Shop").
- Python/dbt venv lives at `./venv` (dbt-core 1.7 + dbt-postgres; `setuptools` is required
  under Python 3.12 to provide the removed `distutils`). `venv/bin` is prepended to PATH by PM2.
- To re-migrate/seed after a schema change (Postgres must be running):
  ```bash
  pnpx dotenv-cli -e .env.development.local -e .env.development -- pnpm -F backend migrate
  pnpx dotenv-cli -e .env.development.local -e .env.development -- pnpm -F backend seed
  ```
- To rebuild the Jaffle warehouse data:
  ```bash
  PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
    ./venv/bin/dbt seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
  # then `dbt run` with the same env/flags
  ```
- EE migrations only run when `LIGHTDASH_LICENSE_KEY` is set; without it, `pgvector` is not
  required (core migrations only need `ltree`, `uuid-ossp`, `citext`, all in `postgresql-contrib`).

### Not running here
Headless browser (screenshots/PDF exports & unfurls), NATS (async query worker), and
Prometheus are not started. Chart/dashboard exploration, saving, and scheduling-via-DB work
without them; features that render images or use the NATS worker will be unavailable.
