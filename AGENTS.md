# AGENTS.md

General development guidance for this repository lives in `CLAUDE.md` (architecture, package layout, lint/test/build/migration commands, code style). Read it first. Per-area notes also live in nested `AGENTS.md` files under `packages/`.

## Cursor Cloud specific instructions

Lightdash is a pnpm/Turbo monorepo (backend API, Vite frontend, `common`/`visualization`/`warehouses`/`formula` build-dep packages) that runs on Postgres + MinIO + a headless browser, all started via Docker.

Cloud Agent `start` runs `/home/ubuntu/.lightdash/cloud-agent-start.sh` on boot. That script starts `dockerd` (no systemd in this VM) and then `./scripts/dev-fast-start.sh`. `install` refreshes Node dependencies, the package builds, and the dbt virtualenvs. Read `/tmp/cursor/start-user/start-user.log` for the boot log; a missing `/tmp/cursor/start-user/` directory means `start` did not run.

### Bringing the stack up (do this at the start of a session)

If `GET /api/v1/health` is not already 200, run the same boot path by hand. It is safe to repeat.

1. Start the Docker daemon when `docker info` fails:
   ```bash
   sudo nohup dockerd > /tmp/dockerd.log 2>&1 &
   ```
   Wait until `docker info` succeeds. `docker` works without `sudo` once `/var/run/docker.sock` is group-accessible (`sudo chmod 666 /var/run/docker.sock` if the current shell is not in the `docker` group). Docker is configured with the `fuse-overlayfs` storage driver and `containerd-snapshotter` disabled (`/etc/docker/daemon.json`) — required for Docker 29 in this nested-container VM.
2. Run the canonical, idempotent bootstrap:
   ```bash
   bash /home/ubuntu/.lightdash/cloud-agent-start.sh
   ```
   That claims a port slot, starts the shared + instance Docker services (Postgres, MinIO, headless-browser, mailpit, nats), reconciles `.env.development.local`, runs migrations, seeds Lightdash + the jaffle-shop dbt demo, starts PM2, and blocks until `GET /api/v1/health` returns 200. On a snapshotted VM the DB bootstraps from a base volume, so it finishes in a few minutes. It ends with a `READY:` line listing the URLs. If the first seed fails because `organization_homepage_settings` is missing (that table is created by an enterprise migration), the start script creates the table and retries once.

Default instance URLs: frontend http://localhost:3000, API http://localhost:8080. Test login: `demo@lightdash.com` / `demo_password!` (seeded "Jaffle shop" project). Mailpit UI: http://localhost:8025.

### Process management

App processes run under PM2, namespaced by `LD_INSTANCE_ID` (default `workspace`). PM2 is a local devDependency — invoke it as `pnpm exec pm2` (there is no global `pm2`):
```bash
pnpm exec pm2 status
pnpm exec pm2 logs workspace-api --lines 80 --nostream
pnpm exec pm2 restart workspace-api      # manual recovery if auto-reload fails
```
Processes: `<instance>-api`, `-api-routes-watch`, `-scheduler`, `-frontend`, `-common-watch`, `-visualization-watch`, `-formula-watch`, `-warehouses-watch`, `-spotlight`. PM2 watches backend source files and restarts the API, while `api-routes-watch` regenerates TSOA artifacts after controller changes. Backend and generated-route changes reload automatically; the other `*-watch` processes rebuild `common`/`visualization`/`warehouses`/`formula` on change.

### Non-obvious caveats

- Node: use Node 24.18.1 (pinned by `.nvmrc`). `/exec-daemon/node` is Node 22 and comes before `/usr/local/bin`. Install puts Node 24.18.1 symlinks in `/usr/local/cargo/bin`, which precedes `/exec-daemon`, and `install`/`start` also prepend `$HOME/.nvm/versions/node/v24.18.1/bin`. `node -v` must print `v24.18.1` before `pnpm install` — native modules are built against it.
- dbt 1.7 must use Python 3.11 (`distutils`). The shared venv is `$HOME/.lightdash/dev-venv`, created with `python3.11`, and `./venv` is a symlink to it. dbt 1.12 lives in `$HOME/.lightdash/dev-venv-1.12` (Python 3.12) and is shimmed as `venv/bin/dbt1.12`. `scripts/dev-fast-start.sh` recreates a missing `./venv` with `python3` only when the shared cache is absent — do not delete `$HOME/.lightdash/dev-venv`. Python 3.11 comes from the deadsnakes PPA because Ubuntu 24.04's default is 3.12.
- Custom data-app chart types need local sandbox images. `dev-fast-start.sh` builds those only when `SANDBOX_PROVIDER=docker`. Standard charts and SQL queries work without them.
- Backend lint runs out of heap with the default Node memory limit and aborts (exit 134). Run it with a larger heap: `NODE_OPTIONS="--max-old-space-size=8192" pnpm -F backend lint`.
