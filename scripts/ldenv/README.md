# ldenv

`ldenv` keeps a built, seeded parent and a small pool of running spare environments.
It works from a plain shell. All registry data, parent worktrees, caches and logs
live under `~/.ldenv`. A worktree gets a private `.env.development.local` file.

## Start work

Prepare a parent and one spare ahead of time:

```sh
pnpm ldenv doctor
pnpm ldenv parent build --ref origin/main
pnpm ldenv pool fill --size 1
pnpm ldenv new feature/my-change
```

`new` prints the worktree path and URL. Open that path in your editor or choose
**New thread in this worktree** in T3 Code. The directory does not move when a
spare is claimed. The claim switches to an existing local branch, or creates a
branch from `--base origin/main`. The branch must descend from a completed parent.
It applies each matching Rainbow tier, checks readiness again and starts a pool
refill in the background. A deep change can take longer than a warm claim.
An empty pool fails with instructions to refill; it does not claim an unready spare.

For an existing worktree, use the fork path:

```sh
pnpm ldenv up
pnpm ldenv up --parent <sha>
pnpm ldenv up --build-parent
pnpm ldenv up --no-wait
pnpm ldenv status --json
```

`--no-wait` finishes after preparation and process launch. A detached monitor
finishes the readiness checks. Status reports the monitor PID, current phase,
last error, last readiness time, live health, timings and process RSS. A dead
monitor with a starting phase means readiness has not been established. Logs
are in `~/.ldenv/logs`; credentials are redacted from command logs.

Readiness requires backend health, a visible `#root > *` on `/login`, a seeded
chart query that returns rows through the API with the dev PAT, and successful
warm routes from `rainbow.toml`. The scheduler has its own health timing. API and
frontend start first; scheduler, tracing and watchers start after API health.
The headline `timeToReady` measures the current fork, fill, claim or restart until
all readiness checks pass. For a fresh instance it is `readyAt - createdAt`;
claims and restarts start a new clock. `total` also includes the scheduler tail
and RSS collection, so it can exceed time to usable. The latency targets apply
to `timeToReady`.

## Prerequisites

Use the Node and pnpm versions pinned by the repository, plus Docker, `sfw`,
Python 3 and the existing dbt 1.12 environment. Like `dev-fast-start`, ldenv reads
`LIGHTDASH_LICENSE_KEY` from `.env.development.local`; an exported key also works.
It never fetches a licence or prints its value. The seed requires EE migrations.
The optional offline licence certificate follows the same path.

Shared infrastructure must already exist under the `ld-shared` Compose project.
`ldenv` reads `docker/docker-compose.dev.shared.yml` and `.env.development` to find
services, ports and S3 settings. It can start a stopped existing container by ID.
It never runs `compose up`, recreates a shared container, or changes its config.
The storage provider can change without a change to ldenv.

The owned `ldenv-pg` container uses `pgvector/pgvector:pg18`, a named
`ldenv_pg_data` volume and port 15432 bound to loopback. Set `LDENV_PG_PORT` before
its first creation to choose another port. The machine encryption secret is
created once in the private `~/.ldenv/machine.json`. Preserve that file with the
volume. Existing resources with mismatched ownership or configuration are refused.

## Stop and remove

```sh
pnpm ldenv stop
pnpm ldenv start
pnpm ldenv down --dry-run
pnpm ldenv down
pnpm ldenv gc --dry-run
pnpm ldenv gc
pnpm ldenv parent list
pnpm ldenv parent gc --keep 2
```

`stop` keeps the database, files and port reservation. `down` terminates only the
instance's connections, drops its database, deletes its PM2 entries and releases
its slot. It restores the old local env file only if the generated file has not
been edited. It keeps the worktree and dependencies. `gc` removes registrations
whose worktrees no longer exist; `up` also runs it. Neither command removes a
parent or another tool's instances. The shared PostgreSQL container and volume
remain for parents and future clones.

Parent GC retains the newest two parents by default and any parent pinned by a
registered instance. Never remove a lock just because it is old. Inspect its
`owner.json` and confirm that the owner and its child commands have exited first.

## What is cached

Parent publication follows install, formula/common/warehouses builds, API
code generation, core and EE migrations, dbt warehouse load, application seed
and seed assertions. The application seed already includes the EE embed seed
when the real licence is present. A marker records completion before the database
becomes a connection-disabled template. Only then is its manifest published.

Forks use `CREATE DATABASE ... TEMPLATE`, not volume copies. The demo warehouse
lives in `ldj_<hash>`, where the hash covers `examples/full-jaffle-shop-demo`.
Parents with the same example content share that warehouse. App seeding uses an
explicit application database connection URI while dbt and the seeded warehouse
credentials use the shared warehouse database. Compiled explores keep that stable
name, so forks need neither credential rewriting nor recompilation. Only the
local dbt project path changes in a fork.

**The demo warehouse is shared and read-mostly.** Writing to its `jaffle` schema
from one instance changes what other instances see. Application data, users,
charts, settings and migrations remain private to each cloned application DB.
Parent GC drops a warehouse only after no remaining parent references it; active
instances pin their parents. A changed example hash creates a separate warehouse.

The lockfile, pnpm version, Node version, platform and architecture guard reuse.
Parents and matching forks use pnpm's global virtual store by default. Workspace
links remain local, while pnpm manages external dependencies in its shared store.
A lockfile or pnpm mismatch uses a normal local offline install. When the module
layout differs from an older parent, package tiers rebuild before API startup.
Use `pnpm ldenv parent build --benchmark-deps` to measure APFS/reflink copies
against local and global-store offline installs in a disposable worktree.
Copies are compared only for parents with a local virtual store. The benchmark is
opt-in and its result persists per machine. Forks choose the measured winner;
before a measurement they use the global store. Normal parent builds do not benchmark. Package
`dist`, build metadata and the Vite dependency cache travel with the clone.
Compiled Node modules and tsx temporary caches use persistent machine directories.
No mutable source directory is shared between parent and child.

Tier matching reads `rainbow.toml` with `smol-toml`. It includes committed changes,
staged and unstaged changes, deletions, renames and untracked files. All matched
run tiers execute in file order. The pnpm preset is handled by dependency setup;
watch tiers require no command. A matching source hash skips a package rebuild.
Unchanged migration trees skip the migration command.

## Local environment differences

These overrides retain the existing local workflow or isolate machine resources:

| Setting                                      | Local value and reason                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIGHTDASH_MODE`, `IS_PULL_REQUEST`          | `development`, `false`, matching PM2's local mode. The preview feature-flag API stays explicitly enabled.                                                     |
| `PG*`, `LIGHTDASH_SECRET`                    | Owned database, fixed dev credentials and machine secret. Inherited connection URIs and secret fallbacks are cleared.                                         |
| Ports, URLs and dbt paths                    | Allocator ports and current worktree paths. The allocator's PostgreSQL port stays reserved for compatibility; the application uses the ldenv PostgreSQL port. |
| `PGWIRE_PORT`                                | Omitted to avoid a fixed-port listener collision between instances.                                                                                           |
| S3, browser, SMTP and NATS endpoints         | Host-published ports from the shared Compose config, with storage credentials from tracked development env.                                                   |
| `AI_COPILOT_ENABLED`, `APPS_RUNTIME_ENABLED` | Off unless explicitly enabled in the local env; the bare EE workflow does not provision external AI credentials.                                              |
| `ALLOW_MISSING_MIGRATIONS`                   | `false`; a local fork must not conceal a missing migration.                                                                                                   |
| `CI`                                         | `false`; this is an interactive local development environment.                                                                                                |
| `RUDDERSTACK_ANALYTICS_DISABLED`             | Always `true`, including build, migration and seed commands.                                                                                                  |

## Keep parents and the pool warm

```sh
git fetch origin
pnpm ldenv parent refresh
```

Refresh checks the fetched `origin/main`. It reuses an unchanged parent. A source
change with no build or migration work advances through cached artifacts and a
database clone; deeper changes build and seed a new parent. Refresh then refills
from the newest parent. Fetch is explicit so refresh does not alter remote refs.

Default pool size is one on either platform; the box can use two with `--size 2`.
The setting persists in `~/.ldenv/pool.json`. A refill requires at least 3 GiB free
RAM and the disk floor (`LDENV_MIN_FREE_GB`, default 8 decimal GB). Watch status RSS
before increasing the pool. Claimed environments are additional to spare capacity.

A cron example (replace the checkout and absolute pnpm path):

```cron
0 * * * * cd /path/to/lightdash && /absolute/path/to/pnpm ldenv parent refresh >> "$HOME/.ldenv/logs/refresh.log" 2>&1
```

On macOS, use a LaunchAgent with `ProgramArguments` set to the absolute pnpm path,
`ldenv`, `parent`, `refresh`; `WorkingDirectory` set to the checkout;
`StartInterval` set to 3600; and explicit `PATH`, `StandardOutPath` and
`StandardErrorPath`. Load it only after an interactive parent build and pool fill
succeed. The job uses the fetched local ref; schedule `git fetch origin` separately
if desired. No cron or LaunchAgent is installed by this tool.

## T3 Code actions

Add these in **Settings → Project → Actions**. Do not add a repository `t3.json`.
For T3-created worktrees, configure:

```json
{
    "name": "Dev env",
    "command": "pnpm ldenv up --no-wait",
    "runOnWorktreeCreate": true,
    "async": true
}
```

Add manual buttons named **Dev env: down** (`pnpm ldenv down`) and
**Dev env: status** (`pnpm ldenv status`). For the fastest path, claim with
`pnpm ldenv new <branch>` first and open the printed worktree in T3.

## Development checks

```sh
pnpm -F lightdash ldenv:test
pnpm -F lightdash ldenv:lint
pnpm -F lightdash ldenv:typecheck
pnpm -F lightdash ldenv:format
```

Runtime acceptance is separate: measure a warm claim, a fresh matching fork,
a fork with a real common change and a new migration, concurrent environments,
coexistence with the existing bootstrap, then complete teardown. Report parent,
claim, fork, backend health, paint, chart, scheduler and RSS measurements. Target
claim latency is under 5 seconds; fork targets are 60 seconds on macOS and
90 seconds on Linux. These are targets until measured on each machine.
