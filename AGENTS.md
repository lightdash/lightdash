# AGENTS.md

General development guidance for this repository lives in `CLAUDE.md` (architecture, package layout, lint/test/build/migration commands, code style). Read it first. Per-area notes also live in nested `AGENTS.md` files under `packages/`.

## Cursor Cloud specific instructions

Lightdash is a pnpm/Turbo monorepo (backend API, Vite frontend, `common`/`warehouses`/`formula` build-dep packages) that runs on Postgres + MinIO + a headless browser, all started via Docker.

The VM startup update script only refreshes Node deps and the dbt venv. Docker, its daemon, and the app processes are NOT started automatically — bring them up yourself as below.

### Bringing the stack up (do this at the start of a session)

1. Start the Docker daemon (it does not auto-start; there is no systemd here):
   ```bash
   sudo dockerd > /tmp/dockerd.log 2>&1 &
   ```
   Wait a few seconds, then confirm with `docker info`. `docker` works without `sudo` (the `ubuntu` user is in the `docker` group). Docker is configured with the `fuse-overlayfs` storage driver and `containerd-snapshotter` disabled (`/etc/docker/daemon.json`) — required for Docker 29 in this nested-container VM.
2. Run the canonical, idempotent bootstrap:
   ```bash
   ./scripts/dev-fast-start.sh
   ```
   It claims a port slot, starts the shared + instance Docker services (Postgres, MinIO, headless-browser, mailpit, nats), reconciles `.env.development.local`, runs migrations, seeds Lightdash + the jaffle-shop dbt demo, starts PM2, and blocks until `GET /api/v1/health` returns 200. On a snapshotted VM the DB bootstraps from a base volume, so it finishes in a few minutes. It ends with a `READY:` line listing the URLs.

Default instance URLs: frontend http://localhost:3000, API http://localhost:8080. Test login: `demo@lightdash.com` / `demo_password!` (seeded "Jaffle shop" project). Mailpit UI: http://localhost:8025.

### Process management

App processes run under PM2, namespaced by `LD_INSTANCE_ID` (default `workspace`). PM2 is a local devDependency — invoke it as `pnpm exec pm2` (there is no global `pm2`):
```bash
pnpm exec pm2 status
pnpm exec pm2 logs workspace-api --lines 80 --nostream
pnpm exec pm2 restart workspace-api      # after backend code changes
```
Processes: `<instance>-api`, `-scheduler`, `-frontend`, `-common-watch`, `-formula-watch`, `-warehouses-watch`, `-spotlight`. The `*-watch` processes rebuild `common`/`warehouses`/`formula` on change; the frontend (Vite) and `common` types hot-reload, but backend changes need an `api` restart.

### Non-obvious caveats

- Node: use Node 20.19 (pinned by `.nvmrc`). The VM's default `node` on `PATH` is a v22 tool-runtime at `/exec-daemon/node`; the nvm 20.19 build is prepended for interactive shells via `~/.bashrc`, and the update script sources nvm explicitly. Run dev commands from a login shell so 20.19 is active — native modules are built against it.
- dbt venv must be Python 3.11: `dbt-core==1.7.0` imports `distutils`, which was removed in Python 3.12 (the VM's default `python3`). The venv at `./venv` is built with `python3.11`. If it must be recreated, use `python3.11 -m venv venv`, NOT `python3`. Note `scripts/dev-fast-start.sh` recreates the venv with `python3` only when it is missing — the snapshot ships a working `python3.11` venv so that path is normally skipped; if you delete the venv, rebuild it with `python3.11` before re-running the script.
- Backend lint runs out of heap with the default Node memory limit and aborts (exit 134). Run it with a larger heap: `NODE_OPTIONS="--max-old-space-size=8192" pnpm -F backend lint`.
