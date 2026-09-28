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
checks. Watched backend code changes replace only the API and wait for compiler
settling and a stable API generation before returning. Unchanged code and
frontend-only edits retain the cheap gate. The spare already passed full readiness
when filled; a background verifier repeats paint and chart checks and retries if
the API restarts during verification. Status exposes `verification` and reports
`degraded` if that check fails. Deep changes run full readiness before returning
and can take longer than a warm claim.
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
`up` probes owned API/frontend processes and health before reusing a saved READY
record. It restarts an instance whose processes are gone. Claims skip dead spares
and request replacement through the pool refill.

Fork readiness requires backend health, a successful frontend HTTP response, a
seeded chart query that returns rows through the API with the dev PAT, and warm
routes from `rainbow.toml`. Headless `/login` paint runs in the background after
ready. Status shows `verification.state: pending`, then `passed` or `failed`; a
paint failure marks the instance `degraded`. A stopped or restarted instance
cannot be overwritten by its old paint verifier. Pool spares pass paint before
they become eligible for a claim.

Vite warms its entry module graph while preparation runs. Package and route
watchers finish their initial scan before the API starts. Documentation files
are ignored; the route watcher generates only after controller edits. Readiness
waits for frontend warmup and repeats its foreground checks if the API restarts.
The API runs the full core and EE scheduler task set, so
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
the foreground readiness checks pass. For a fresh instance it is `readyAt - createdAt`;
claims and restarts start a new clock. `total` also includes the scheduler tail
and RSS collection, so it can exceed time to usable. Background paint has separate
verification timings. The latency targets apply to `timeToReady`.

## Prerequisites

Use the Node and pnpm versions pinned by the repository, plus Docker, `sfw`,
`lsof`, Python 3 and the existing dbt 1.12 environment. Like `dev-fast-start`, ldenv reads
`LIGHTDASH_LICENSE_KEY` from `.env.development.local`; an exported key also works.
It never fetches a licence or prints its value. The seed requires EE migrations.
The optional offline licence certificate follows the same path. If no licence is
set for the target, parent fallback supplies only the licence key and certificate;
it does not copy the parent's tracing, scheduler or feature flags.

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
its slot. It restores the original local env file when the last ldenv-written file
is intact. If the user edited it, down keeps the backup and prints its path.
Tracing rewrites update that backup record without losing the original content.
User and claimed worktrees remain. Detached ldenv-owned spare/warming worktrees
are removed only after ownership and live-use checks.

`gc --dry-run` lists missing registrations and eligible orphan warm/tool
checkouts before deletion. `gc` skips a failed instance cleanup and reports why.
It preserves branch-attached or edited worktrees, live process references, the
active tool and its previous version. Claimed warm paths remain retained even
after down. Run GC explicitly; an unrelated stale instance cannot block `up`.
The shared PostgreSQL container and volume remain for parents and future clones.
The shared `dev-ports.sh` probe suppresses lsof warnings, can use `ss` when lsof
is absent, and stops with a probe error instead of treating inspection failure
as either a free port or repeated port conflicts.

Parent GC retains the newest two parents by default and any parent pinned by a
registered instance. It moves each selected manifest out of parent selection
before dropping resources. Partial retirements are retried on the next parent GC.
Locks are reclaimed only after checking an old owner's process identity; age
alone is not proof. A live or unverifiable owner stays protected, with a specific
busy message. Contended lock recovery uses Python's kernel file lock on macOS
and Linux so two reclaimers cannot steal a fresh owner's lock.

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
not trigger a full initial watcher build. Matching global-store forks copy
dependency links and build artifacts concurrently, then relocate build metadata
after both finish. Fallback installs wait for copying before running hooks.
When no tier needs to run, watcher
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
misses remain valid cold starts and are never counted as hits. The `profile`
fingerprint records the code that produced a snapshot for diagnosis; it is not
an extra compatibility gate. Matching resolved inputs and validated artifact
checksums determine reuse, so a tooling-only change can retain a valid snapshot.
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
depth from the parent. Record foreground readiness and background first paint
separately; require background verification to pass. Require zero API restarts
from process launch through 60 seconds after ready; a Markdown edit during that
window must not restart the API. Report parent,
claim, fork, backend health, paint, chart, scheduler and RSS measurements. Target
claim latency is under 1 second for the cheap gate; fork targets are 60 seconds on macOS and
90 seconds on Linux. These are targets until measured on each machine.

## Measured Mac timings

On 28 September 2026, a fresh `origin/main` worktree under T3's real worktree
path, started through the installed launcher with `up --no-wait` and ordinary
shell environment markers, reached foreground readiness in **26.6 seconds**.
The authenticated chart query passed before ready. Background headless paint
passed at 32.7 s without changing the ready time; its check took 5.86 s.
Dependencies and artifacts overlapped in 2.00 s (1.78 s dependencies, 1.23 s
artifact copy, then 0.22 s metadata finalization). DB clone took 0.48 s, ports
0.17 s, Vite cache restore 1.91 s with a verified hit, watcher setup 2.94 s,
dbt-path update 0.27 s, API health 17.62 s and chart query 0.54 s. Frontend
preparation, watchers and the path update overlap; graph warmup overlaps API
boot. Total including RSS collection was 26.9 s. The API had zero restarts from
launch through 60 seconds after readiness, including a Markdown edit. Health
stayed available, and Vite did not rebundle dependencies.

The prior full-paint gate took 30.3 s in an owned T3-path worktree and 30.6 s in
an actual T3 New worktree run. The latter's in-app preview painted in 1.0 s.
The 26.6 s sample is above the 24–25 s goal, with API boot accounting for about
two thirds of its foreground time. These runs have different machine load.

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

## Bundled API by default

New instances use the incremental bundle mode by default. Select the tsx
fallback for a new instance with either command:

```sh
ldenv up --backend tsx
LDENV_BACKEND=tsx ldenv up
```

An existing instance without a saved backend selection reports tsx while its
legacy API is running. A fully stopped instance selects the new bundle default
on `ldenv start`. To keep tsx, use `ldenv start --backend tsx`. To switch a
running instance, run `ldenv stop`, then `ldenv start --backend bundle`. Return to tsx with
`ldenv stop` and `ldenv start --backend tsx`. The selection is stored in the
instance's local environment and survives later starts. A mode change on an
already running instance is refused. Pool claims require a ready spare in the
selected mode; a matching spare keeps the fast claim path. Pool fill replaces
owned spares in a different mode.

The existing PM2 API entry owns a supervisor with one esbuild context and one
API child. Successful changed builds stop and wait for that child before starting
the new bundle. Concurrent build notifications are serialized; each waits for
its build and child start or stop to finish.
The frontend, package watchers and other instances keep running. A failed rebuild
keeps the last good API and output, prints the compiler error, and exposes it in
`ldenv status` as `bundle.error`, `bundle.state=failed` and a degraded phase. Live
health can still be true while `ready` is false. Fixing the edit clears the error.
An initial failed build never launches a saved artifact from an earlier run.
An unexpected API exit causes PM2 to restart the supervisor.

Bundles preserve names, source asset paths and TypeScript source maps, but omit
embedded source content from both maps. Debugging needs the local source files.
Packages remain external. The worktree provides esbuild; the pinned ldenv tool
provides get-tsconfig. The existing Node compile cache is reused. The esbuild
process uses `GOMEMLIMIT=512MiB` as a soft Go garbage-collection goal, not an
RSS limit. Tracing
continues to follow `--tracing` / `LDENV_TRACING`; bundle mode does not override it.
The optional standalone scheduler remains on tsx.

Keep the existing route and package watchers. Controller edits still regenerate
TSOA routes; common, formula and warehouses build-completion markers cause an API
restart even when the bundle bytes are unchanged. Restart the instance after
changes to dependencies, the lockfile or Node. Bundle output and status live in
`~/.ldenv/bundles/<instance-id>` (or under `LDENV_HOME`); `down` removes only that
instance's bundle directory. The output refers to the owning worktree and is not
a portable production build.

The build status includes supervisor/API PIDs, build duration and generation.
`bundle.state=ready` means compilation succeeded and the API child was launched;
the top-level `healthy` and `ready` fields also check live API health.
