# ldenv

`ldenv` keeps a built, seeded parent and a small pool of running spare environments.
It works from a plain shell. All registry data, parent worktrees, caches and logs
live under `~/.ldenv`. A worktree gets a private `.env.development.local` file.

## Install the machine launcher

From a checkout of this branch with dependencies installed, run:

```sh
pnpm ldenv install
```

This pins the committed tool in `~/.ldenv/tools/<sha>` with its own dependencies
and installs `~/.ldenv/bin/ldenv`. It works even when the target branch has no
`node_modules` or `scripts/ldenv`. Parent builds refresh the launcher; rerun
`pnpm ldenv install` from the implementation checkout to pick up tool updates.
Installation checks or refreshes retained parent Vite snapshots with the new pinned
runtime before switching the launcher. Parent manifests record the tool revision
and cache key. The pinned tool checkout must stay in place while its processes are running.

Commands target `--worktree PATH`, then `T3CODE_WORKTREE_PATH`, then the shell's
current directory, in that order. For example:

```sh
~/.ldenv/bin/ldenv --worktree /path/to/fresh-worktree up --no-wait
```

A fresh worktree can inherit the development EE licence from its selected parent.
The licence is written only into its private local env file and is never printed.

## Start work

Prepare a parent and one spare ahead of time:

```sh
~/.ldenv/bin/ldenv doctor
~/.ldenv/bin/ldenv parent build --ref origin/main
~/.ldenv/bin/ldenv pool fill --size 1
~/.ldenv/bin/ldenv new feature/my-change
```

`new` prints the worktree path and URL. Open that path in your editor or choose
**New thread in this worktree** in T3 Code. The directory does not move when a
spare is claimed. The claim switches to an existing local branch, or creates a
branch from `--base origin/main`. The branch must descend from a completed parent.
It applies each matching Rainbow tier and starts a pool refill in the background.
A source-only claim returns after live API health, frontend and authentication
checks. The spare already passed full readiness when filled; a background verifier
repeats paint and chart checks after the claim. Status exposes `verification` and
reports `degraded` if that check fails. Deep changes run full readiness before
returning and can take longer than a warm claim.
An empty pool fails with instructions to refill; it does not claim an unready spare.

For an existing worktree, use the fork path:

```sh
~/.ldenv/bin/ldenv up
~/.ldenv/bin/ldenv up --parent <sha>
~/.ldenv/bin/ldenv up --build-parent
~/.ldenv/bin/ldenv up --no-wait
~/.ldenv/bin/ldenv status --json
```

`--no-wait` finishes after preparation and process launch. A detached monitor
finishes the readiness checks. Status reports the monitor PID, current phase,
last error, last readiness time, live health, timings and process RSS. A dead
monitor with a starting phase means readiness has not been established. Logs
are in `~/.ldenv/logs`; credentials are redacted from command logs.

Readiness requires backend health, a visible `#root > *` on `/login`, a seeded
chart query that returns rows through the API with the dev PAT, and successful
warm routes from `rainbow.toml`. Vite starts after dependencies are ready and warms
its entry module graph while the remaining preparation runs. Package and route
watchers must finish their initial scan before the API starts. Documentation files
are ignored; the route watcher generates only after controller edits. Readiness
waits for frontend warmup and repeats its checks if the API restarts during them. The API runs the full core and EE scheduler task set, so
ldenv does not start a duplicate scheduler process by default. To opt in, export
`LDENV_STANDALONE_SCHEDULER=true` before `up`, or set it in the instance's local
env file before `stop` / `start`. The optional scheduler watches backend changes
and has its own health timing. The Node inspector binds only to `127.0.0.1`.
Tracing is off by default (`OTEL_SDK_DISABLED=true`). Use `up --tracing`,
`new <branch> --tracing`, or export `LDENV_TRACING=true` to enable it. For an
existing instance, `stop` then `start --tracing` applies the change. A tracing-mode
claim requires a restart and uses full readiness. Export `LDENV_TRACING=false`
before a restart to return to the fast default.

The headline `timeToReady` measures the current fork, fill, claim or restart until
all readiness checks pass. For a fresh instance it is `readyAt - createdAt`;
claims and restarts start a new clock. `total` also includes the scheduler tail
and RSS collection, so it can exceed time to usable. The latency targets apply
to `timeToReady`.

## Prerequisites

Use the Node and pnpm versions pinned by the repository, plus Docker, `sfw`,
`lsof`, Python 3 and the existing dbt 1.12 environment. Like `dev-fast-start`, ldenv reads
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
~/.ldenv/bin/ldenv stop
~/.ldenv/bin/ldenv start
~/.ldenv/bin/ldenv down --dry-run
~/.ldenv/bin/ldenv down
~/.ldenv/bin/ldenv gc --dry-run
~/.ldenv/bin/ldenv gc
~/.ldenv/bin/ldenv parent list
~/.ldenv/bin/ldenv parent gc --keep 2
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
When package manifests, lockfile, workspace config, pnpm hooks and patches match,
forks copy private link directories and relocate workspace links and executable
shims. Vite caches are handled separately. Changed inputs or an unsafe link tree
fall back to installation.
A lockfile or pnpm mismatch uses a normal local offline install. When the module
layout differs from an older parent, package tiers rebuild before API startup.
Use `~/.ldenv/bin/ldenv parent build --benchmark-deps` to measure APFS/reflink copies
against local and global-store offline installs in a disposable worktree.
Copies are compared only for parents with a local virtual store. The benchmark is
opt-in and its result persists per machine. Matching global-store parents use the link-copy fast path. Other forks choose
the measured winner; before a measurement they use the global store. Normal parent builds do not benchmark. Package
`dist` and build metadata travel with the clone. External dependency paths in
TypeScript metadata are relocated, so worktrees at different directory depths do
not trigger a full initial watcher build. When no tier needs to run, watcher
settling and the dbt-path update overlap frontend cache restore and process launch.
The parent stores the seeded project UUID so a path update avoids loading the
common package.

Parent builds populate a private Vite optimizer snapshot. Matching forks copy it
and relocate paths after checking the lockfile, Vite configuration and its imports,
patch contents, package manifests, Node and platform. A reviewed Vite version and
source hash guard the optimizer metadata adapter; other versions safely miss the
cache. Each fork owns its cache files. A changed or corrupt snapshot also falls
back to normal optimization. The ldenv frontend launcher pre-transforms static
entry imports before readiness; the repository-wide Vite config is unchanged.
The frontend version comes from its target package, independent of the calling
shell. Console forwarding is explicitly enabled so Vite's automatic agent
detection cannot change the plugin list between parent builds and T3 startup.
Status records the cache hit or miss, reason, and compared keys. Cache
misses remain valid cold starts and are never counted as hits.
Node uses the persistent `~/.ldenv/cache/node` compile cache. Parent builds and
pool fills warm the backend import graph before boot. tsx keeps its default disk
cache. Absolute source paths can limit reuse between worktrees.
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
~/.ldenv/bin/ldenv parent refresh
```

Refresh checks the fetched `origin/main`. It reuses an unchanged parent with the
current global-store layout. An older layout gets fresh artifacts in a separate
cache worktree; its frozen database is reused and the old files remain available
to forks that already selected them. A source
change with no build or migration work advances through cached artifacts and a
database clone; deeper changes build and seed a new parent. Refresh then refills
from the newest parent. Fetch is explicit so refresh does not alter remote refs.

Parent builds and refills yield between commands while a user-facing fork or claim
starts. Their commands run with `nice` and macOS background I/O policy. Warming
processes use background priority, restored when a spare is claimed.

Default pool size is one on either platform; the box can use two with `--size 2`.
The setting persists in `~/.ldenv/pool.json`. A refill requires at least 3 GiB free
RAM and the disk floor (`LDENV_MIN_FREE_GB`, default 8 decimal GB). Watch status RSS
before increasing the pool. Claimed environments are additional to spare capacity.

A cron example (replace the checkout and absolute launcher path):

```cron
0 * * * * cd /path/to/lightdash && /home/developer/.ldenv/bin/ldenv parent refresh >> "$HOME/.ldenv/logs/refresh.log" 2>&1
```

On macOS, use a LaunchAgent with `ProgramArguments` set to the absolute
`~/.ldenv/bin/ldenv` path, `parent`, `refresh`; `WorkingDirectory` set to the checkout;
`StartInterval` set to 3600; and explicit `PATH`, `StandardOutPath` and
`StandardErrorPath`. Load it only after an interactive parent build and pool fill
succeed. The job uses the fetched local ref; schedule `git fetch origin` separately
if desired. No cron or LaunchAgent is installed by this tool.

## T3 Code actions

Add these in **Settings → Project → Actions**. Do not add a repository `t3.json`.
Install the machine launcher first. For T3-created worktrees, configure:

```json
{
    "name": "Dev env",
    "command": "~/.ldenv/bin/ldenv up --no-wait",
    "runOnWorktreeCreate": true,
    "async": true
}
```

Add manual buttons named **Dev env: down** (`~/.ldenv/bin/ldenv down`) and
**Dev env: status** (`~/.ldenv/bin/ldenv status`). For the fastest path, claim with
`~/.ldenv/bin/ldenv new <branch>` first and open the printed worktree in T3.

## Development checks

```sh
pnpm -F lightdash ldenv:test
pnpm -F lightdash ldenv:lint
pnpm -F lightdash ldenv:typecheck
pnpm -F lightdash ldenv:format
```

Runtime acceptance is separate: measure a warm claim, a fresh matching fork,
a fork with a real common change and a new migration, concurrent environments,
coexistence with the existing bootstrap, then complete teardown. Use the installed
launcher from a fresh worktree without dependencies, at a different directory
depth from the parent. Include the first browser paint. Require zero API restarts
from process launch through 60 seconds after ready; a Markdown edit during that
window must not restart the API. Report parent,
claim, fork, backend health, paint, chart, scheduler and RSS measurements. Target
claim latency is under 1 second for the cheap gate; fork targets are 60 seconds on macOS and
90 seconds on Linux. These are targets until measured on each machine.

## Measured Mac timings

On 28 September 2026, a fresh `origin/main` worktree at T3's directory depth,
started through the installed launcher with `up --no-wait`, reached readiness in
**34.5 seconds**, including the first browser paint. Dependencies and artifacts
took 2.71 s (1.47 s dependency setup, 1.25 s artifacts), DB clone 0.42 s,
port allocation 0.16 s, Vite cache restore 1.90 s with a verified hit, watcher
setup 2.93 s, dbt-path update 0.27 s, API health 19.65 s, paint 4.82 s and
chart query 0.27 s. Frontend preparation, watchers and the path update overlap;
frontend graph warmup overlaps API boot. Total including RSS collection was 34.8 s.
The API had zero restarts from launch through 60 seconds after readiness, including
a Markdown edit. Health stayed available, and Vite did not rebundle dependencies.

The preceding actual T3 run took 40.6 s with a cache miss, 5.23 s code setup,
4.64 s watcher setup and 2.44 s path setup. The cache diagnostics later isolated Vite's `vite:forward-console` plugin: its
default depends on whether Vite detects an agent. ldenv now enables it explicitly
for parent builds and all launches, preserving the full plugin compatibility
check. Caller package-version differences are also removed by using the target
frontend version. Explicit configuration changes still invalidate the cache.

Before the watcher and Vite fixes, this deeper-worktree path took 54.4 s with
26.0 s paint and reported ready just before an API restart. An earlier 25.3 s
sample used a shallower worktree and did not expose the TypeScript metadata
relocation bug; it is not the T3 baseline. These are sequential samples with
varying machine load, not a controlled statistical trial.

Warm claims reached 0.53 s before the background-priority changes. Parent builds
and fills use background priority and can take substantially longer than a
foreground fork; they prepare future claims. Timings under simultaneous fills,
forks and other development instances are not directly comparable to idle runs.

The same main revision on the Linux box reached readiness in **29.4 seconds**
(dependencies/artifacts 3.83 s, DB clone 0.22 s, ports 0.13 s, API health 16.72 s,
paint 4.36 s). A warm claim took **0.527 seconds**, including restoring the spare's
process priority. Background paint and chart verification passed. Its automatic
refill waited for the fresh fork to finish starting. All box acceptance instances
were then removed; the parent, shared warehouse and launcher remain cached.
