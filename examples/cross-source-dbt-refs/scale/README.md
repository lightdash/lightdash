# Cross-source scale fixture

This fixture connects 20 dbt projects as separate GitHub dbt sources of one
Lightdash project. The default generation has 1,623 model nodes, including
1,500 in one project. Models produce 8–20 rows and five typed columns: `id`,
`label`, `amount`, `active`, and `event_date`. Every model has an integer primary
key and a `row_count` metric. Values and row counts vary by seed so wrong
relations are easier to spot.

Run the scripts from any working directory. Python uses only the standard
library. Building also needs `dbt1.12` with the Postgres adapter.

## Generate

The generated projects are not committed. `projects/` is in `.gitignore`.
Generate them before you build, register or verify:

```bash
cd examples/cross-source-dbt-refs/scale
python3 generate.py --count 20 --out projects --seed 42 --large-models 1500
```

For a larger run, raise the count. Every kind stays present from 12 projects up:

```bash
python3 generate.py --count 50 --out projects --seed 42 --large-models 1500
```

The server clones each source from a git branch, so registration needs the
generated projects on a branch the server can reach. Commit them on a scratch
branch for the run and delete that branch afterwards; do not add them to the
pull request. The N=20 run recorded in PR #31113 used 20 sources, 1,622 models
and 62 cross-project refs.

Generation is deterministic. A repeat run replaces generated source files and
removes stale files listed in `.generated-files.json`. It keeps dbt build
outputs until `build.sh --clean` is run. Each project uses the shared
`cross_source_refs` profile and its own schema suffix. For `SEED_SCHEMA=jaffle`,
project `scale_00_fanout` builds into `jaffle_scale_00_fanout`.

The generated JSON files live in `projects/`:

- `topology.json` lists each project's kind, model names, model node details,
  cross-project refs, and seeds and snapshots. Node details include the dbt
  version, access, expected row count and Lightdash explore name.
- `build_order.json` gives a topological project order.
- `register.json` gives the source names and project subpaths.

The kinds are `leaf` (no upstream refs), `hub` (50 models), `chain` (sequential
dependencies), `diamond` (shared upstream paths that converge), `fanin`
(refs to 19 projects), `fanout` (provides models to 16 projects), `samename`
(shared `customers` model names), `versioned` (v1/v2 plus local private and
protected models), `mixed` (seed, snapshot, incremental model and explicit-v2
and latest consumers), and `large` (1,500 models, 20 with external refs).
The hubs also form a diamond with the fan-out root. The longest default path
has 10 projects and nine edges. Every kind is present with at least 12 projects;
smaller counts retain the shapes that fit.

Same-named explores use the source-qualified name, such as
`scale_00_fanout__customers`. Both versions of the product model have the same
dbt model name and one expected Lightdash explore name; the fixture builds
both physical versions and uses v2 for its cross-project consumers. Private
models are excluded from the explore check. Seeds and snapshots are listed as
resources, not expected model explores.

## Build

Export `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and optionally
`SEED_SCHEMA`, as required by `../profiles/profiles.yml`. Supply the password
through your shell environment without putting it in scripts or checked files.

```bash
./build.sh
./build.sh --clean --dry-run
./build.sh --clean
```

The build runs `dbt1.12 seed --full-refresh`, `snapshot`, and
`run --full-refresh` for each project, in that order. It uses one dbt thread
and one process at a time. Snapshots use the check strategy and retain history;
dbt does not have a snapshot full-refresh option. A repeat run replaces tables
and seeds and reconciles the incremental model with `--full-refresh`.

`tooling/dbt_lightdash_external_nodes.py` is the bundled dbt plugin. Before each
project builds, `.work/external_nodes.json` contains all actual model nodes
from projects already built, including every version. Injected stubs and seed
or snapshot dependencies are excluded when exporting a project's nodes.
Every project prints its time in milliseconds and exit code. The final summary
and stage timings are saved to `.work/timings.json`; detailed dbt output goes
to `.work/<project>.log`. A failed stage stops the build and returns non-zero.

`--clean` removes only the fixture's `target/`, `logs/`, `dbt_packages/` and
`.work/` directories. It keeps generated inputs and warehouse relations.
`--projects`, `--profiles-dir` and `--dbt` can override the default paths.

## Register

Push the fixture to the chosen branch before registration. Enable the
`multi-dbt-sources` and `cross-source-dbt-refs` flags for the organization.
Provide a session cookie jar and set `GITHUB_TOKEN` in the shell environment.

```bash
./register.sh --api-url http://localhost:8640 --project PROJECT_UUID \
  --branch YOUR_BRANCH --repo lightdash/lightdash --cookie-jar /tmp/ld.jar \
  --subpath-prefix /examples/cross-source-dbt-refs/scale/projects
./register.sh --api-url http://localhost:8640 --project PROJECT_UUID \
  --cookie-jar /tmp/ld.jar --delete
```

Registration sends one POST per source, sequentially, and prints each HTTP
status. A repeat registration returns API duplicate-name errors; use `--delete`
to remove matching additional sources first. Delete mode reads the current
source UUIDs and does not remove the primary source or other source names.
Tokens and API error bodies are never printed. `--registry` selects another
registration JSON file.

## Verify after refresh

Refresh the Lightdash project after registration, then run:

```bash
python3 verify.py --api-url http://localhost:8640 --project PROJECT_UUID \
  --cookie-jar /tmp/ld.jar --topology projects/topology.json
```

The verifier confirms that each fixture source appears once, checks all expected
model explore names for errors, and checks every cross-project ref's join table
and dbt package. It then sends ten sample join queries, spread across topology
kinds, through the v1 `runQuery` endpoint. Each query selects both base and
upstream row-count metrics so the upstream join is used. It checks returned
rows, the base model's exact expected row count and a positive upstream count.
`--sample-size` changes the number of queries. The output is a Markdown results
table and any failed check produces a non-zero exit code. Existing sources and
explores outside the fixture do not fail the count check.
