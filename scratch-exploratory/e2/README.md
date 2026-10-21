# Server refresh exploratory handoff

This is the E2 prep branch. It contains synthetic fixture inputs and local test tools only. It contains no product changes from either draft PR.

The box stopped after the initial failure-isolation cases. See `reports/31358.md`, `reports/31362.md`, and `reports/box-results.json`. The remaining scripts are prepared, not runtime-verified after their portability and locking edits. The Big Mac needs a fresh local database and source registrations; the box's runtime state is intentionally absent.

## Prepare the target checkout

Use the worktree attached to the new T3 thread. Fetch the target and restore these two prep paths after checking out its head:

```bash
git fetch origin main scratch/exploratory-prep-e2 thunder/refresh-source-failure-isolation thunder/stable-explore-names
git switch --detach origin/thunder/refresh-source-failure-isolation
git restore --source origin/scratch/exploratory-prep-e2 --worktree -- examples/multi-repo-dbt-sim scratch-exploratory/e2
```

Use Node from `.nvmrc`, pnpm, Python 3.12, uv, Git signing, and OpenSSL with `req -addext`. Git must be able to write its system configuration: the fixture temporarily adds one URL-scoped CA setting for its loopback Git service, then removes it in `finally`. TLS verification stays enabled. The copied `initialise_repos` helper signs and verifies each synthetic repo's commits. Nothing pushes those repos externally.

## Bootstrap on the Big Mac

The following are commands for the receiving machine. They were not executed during the handoff.

```bash
export NODE_OPTIONS=--max-old-space-size=4096
export EXPLORATORY_LOCK="$HOME/.cache/lightdash-exploratory/heavy.lock"
bash scratch-exploratory/e2/setup.sh
export EXPLORATORY_DBT="$PWD/examples/multi-repo-dbt-sim/.work/venvs/dbt12/bin/dbt"
export PATH="$PWD/examples/multi-repo-dbt-sim/.work/venvs/dbt12/bin:$PATH"
python scratch-exploratory/e2/prepare.py
```

Start only this worktree's ldenv instance. Supply its existing local EE configuration through the normal ldenv setup; do not copy another machine's environment file.

```bash
ldenv up --backend bundle --no-wait
ldenv wait
read -r -p 'Seeded login email: ' SIM_EMAIL
read -r -s -p 'Seeded login password: ' SIM_PASSWORD
printf '\n'
export SIM_EMAIL SIM_PASSWORD
python - <<'PY'
from pathlib import Path
p = Path('.env.development.local')
s = p.read_text()
settings = {
    'LIGHTDASH_ENABLE_FEATURE_FLAGS': 'multi-dbt-sources,cross-source-dbt-refs',
    'NODE_OPTIONS': '--max-old-space-size=4096',
    'DBT_SOURCE_FETCH_CONCURRENCY': '1',
}
for key, value in settings.items():
    lines = [line for line in s.splitlines() if not line.startswith(key + '=')]
    s = '\n'.join([*lines, key + '=' + value]) + '\n'
p.write_text(s)
PY
ldenv stop
ldenv start --backend bundle --no-wait
ldenv wait
python scratch-exploratory/e2/build_fixture.py
pnpm -F @lightdash/cli build
```

The exact tested tools were dbt-core 1.12.0, dbt-postgres 1.10.2 and psycopg2-binary 2.9.13. dbt-loom 0.9.6 supports the copied full runner; the reduced E2 fixture removes its Loom configuration and uses four independent repos. `prepare.py` selects payments, merchants, finance and marketing, with six synthetic models total. The generated profile is `examples/multi-repo-dbt-sim/.work/exploratory/profiles/profiles.yml`, profile `multi_repo_sim`, target `dev`. It reads `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` from the local instance environment. `build_fixture.py` loads that environment without printing credentials and runs `dbt seed --full-refresh --threads 1` then `dbt run --full-refresh --threads 1` for each selected repo. Each seed contains three labelled synthetic rows.

The harness creates Git-backed projects and `project_dbt_sources` through the local API. It serves a signed bare Git repo for each source with `git http-backend` over loopback HTTPS. API configs use `repository=sim/<source>`, `branch=main`, `project_sub_path=/`, an empty Git credential and the loopback Git service's domain/port. No external dbt repo is contacted. `EXPLORATORY_GIT_PORT` defaults to an arbitrary fixture port and must remain the same between scripts that reuse project state. Source denial returns HTTP 403, including when the runner is privileged.

The API URL and instance identity come from `ldenv status --json`; scripts refuse a status bound to another checkout. Heavy API operations, deploys and dbt commands take `EXPLORATORY_LOCK` and check load inside it. Linux uses `free -g`; macOS uses `vm_stat`. A Python `fcntl.flock` fallback is available when the `flock` command is absent. Use the same lock path in E1. Apply the receiving thread's load/serialization rules to the manual bootstrap commands too. No command should exceed 35 minutes; use a 2,000-second outer timeout available on that machine.

## Continue the cases

```bash
EXPLORE_BATCH=31358 E2_SKIP_COMPLETED=1 python scratch-exploratory/e2/batch58.py
```

This builds a fresh baseline and chart, repeats the bad-branch case to prove its pending recovery, then continues the remaining failures and interactions. Do not set `RESUME_58=deps` on a fresh machine: that mode needs the previous instance's generated project state. The dbt wrapper is instance-scoped through a PM2 environment update. It forwards real dbt commands and injects a nonzero ls exit or invalid manifest only for the selected source. Its warning probes use synthetic markers. Cancellation stops the instance while a marked secondary dbt ls is sleeping. The resolution timeout is 15 seconds and verifies that the secondary sleep was reached.

Then restart this same instance and run the old-writer setup before switching to the naming PR:

```bash
ldenv start --backend bundle --no-wait
ldenv wait
EXPLORE_BATCH=31362 python scratch-exploratory/e2/old62.py
```

`old62.py` prepares cached qualified names with the old writer. It applies the actual two naming migrations from the fetched PR ref, checks an old-writer refresh with the new empty table, then rolls those temporary migrations down. They are not entered in the migration ledger during this rolling check. The script stops its instance. Keep its ignored project state and generated repo histories for the next cases.

```bash
git fetch origin thunder/stable-explore-names
git switch --detach origin/thunder/stable-explore-names
git restore --source origin/scratch/exploratory-prep-e2 --worktree -- examples/multi-repo-dbt-sim scratch-exploratory/e2
pnpm -F common build
pnpm -F @lightdash/cli build
pnpm -F backend generate-api
pnpm exec dotenv -e .env.development.local -e .env.development -- pnpm -F backend migrate
ldenv start --backend bundle --no-wait
ldenv wait
EXPLORE_BATCH=31362 python scratch-exploratory/e2/batch62_owner.py
ldenv start --backend bundle --no-wait
ldenv wait
EXPLORE_BATCH=31362 python scratch-exploratory/e2/batch62_reservation.py
ldenv stop
```

The fetched naming head must include the reservation rule. At handoff it was `c0abadfe4a8ef5eee15c452f54e4096d5c60a01d`. The allocation table is per project, and `is_reserved` marks the plain-name reservation. The prepared cases cover seeding, first ownership, original chart/dashboard references, an occupied qualified name, rename, owner removal/re-addition, newcomer removal, two newcomers, a later third source, repeated refresh, CLI deploy, restart, one or no surviving colliding model, and a package collision within one source.

Each batch revokes its temporary access token, removes its scoped Git trust setting, closes its Git service and stops its own ldenv instance in cleanup. Runtime state, manifests, bare repos, certificates, environment files and access tokens stay ignored. No PR was opened for this prep branch. Report genuine draft-PR bugs to their owner threads, ask for signed normal pushes with no force-push, and retest the new head. Do not push a draft PR branch from this handoff.
