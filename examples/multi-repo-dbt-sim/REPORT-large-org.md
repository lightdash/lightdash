# Large-org multi-source scenario

All repositories, source names, SQL, seeds and returned data are synthetic.
The fixture runs only on the ldenv instance attached to this worktree. It
uses one Postgres warehouse connection and server refresh. Each measured
request uses a temporary service-account bearer token. The runner checks
that the refresh job's actor is that service account, then revokes it.

## Ground truth and scope

The paused synthetic retry fixture mixes one- and two-argument refs to the
same duplicated name in separate models. A third model explicitly refs a
different model in the primary provider. The saved SQL establishes that
shape. It does not establish the original organisation's SQL.

The paused cycle fixture contains this closed model path. Arrows mean
"depends on":

```text
proj_a.reporting_x -> proj_a.staging_x -> proj_b.transactions_x
-> proj_b.curated_x -> proj_c.mart_x -> proj_a.reporting_x
```

It has two local one-argument refs and three cross-project two-argument refs.
The saved fixture is unversioned. The new versioned probe uses
`model.proj_b.transactions_x.v3` and pins the staging ref with `v=3`, as the
requested scenario requires. The separate nine-project source ring is
model-acyclic. The nine-project closed model loop is an explicit synthetic
expansion, not a claim about an unverified original graph.

The new `one-arg` variant removes the explicit ref to `model_shared`. Its
remaining models use `ref('model_shared')` and
`ref('proj_core', 'model_other')`. The duplicated model is defined by the
primary `proj_core` project and `analyst_hub`. A filtered CI-style manifest
for the consumer contains `proj_core.model_other` and omits
`proj_core.model_shared`; the ordinary provider manifest is unchanged.
The consumer imports `analyst_hub.model_shared` through dbt-loom.

No PR is known to make the cross-source model loop valid. The requested
#31284 comparison tests earlier cycle detection and version-binding retries;
it does not assume that the cycle will disappear.

## Method

The original 88-case matrix, run 7 and initial run 7b use the private
development toolchain: dbt-core 1.12.3, dbt-loom 0.9.6 and dbt-postgres
1.10.0. These are not the shipped image pins. The later image-faithful 7b
comparison records server and publication toolchains separately. Earlier
flag-off and plugin observations must be read with this toolchain limit.

The profile has 19 connected sources and a stable union of 49 logical models.
All variants retain the same model/schema identities. The selector has no
matching nodes. The unreadable source is denied by the local Git server.
The duplicate-source variant points two source entries at the same Git
remote. `proj_bank` and `proj_bank_reporting` remain distinct projects.
`shared_dims` and `proj_unconnected` are referenced but are not connected.

Product source is exported with `git archive` at each recorded commit. The
backend and its common, formula and warehouse packages are built from that
same archive. Matching external package versions come from the installed
cache or a private directory under the archive. No shared installation or
tracked product source is changed. The API bundle and workspace outputs
have recorded SHA-256 checksums. The pinned API and its embedded compile
worker use the existing instance's ports and database. A separate worker is
kept stopped so the selected build executes the queued refresh.

The feature-flag API confirms each requested flag state. The local API uses
`DBT_SOURCE_FETCH_DISK_BUDGET_BYTES=3221225472` and
`DBT_SOURCE_FETCH_CONCURRENCY=4`. Its temporary directory is private to the
fixture and build. Before each measured refresh, the runner clears only its
own partial-parse cache after project setup. This makes the initial disk
calculation use an empty baseline. The default reserve and per-source
allowances are both 256 MiB. The disk-derived limit is 11. The product's pool
constructor uses the chosen concurrency as its resident capacity, so that
limit must not be described as 11 resident sources when concurrency is 4.

Product terminal logs supply the flag-on eviction and recreation counts.
The flag-off path logs only its starting counters. A read-only Node
Inspector observer reads `diskPool.stats` at source-fetch completion or at
the failure throw after cleanup. It resumes immediately and does not change
product code or variables. Its observations are compared with product logs
where both exist. Unavailable counters remain unknown, never zero by default.

All heavy commands pass the load gate and run serially. The wrapper bounds
each invocation and keeps completed rows in the ignored result JSON. It
stops the owned instance, observer and Git server on completion or failure.

## Re-run the scenario

First run `setup.sh` from the fixture README to prepare the private dbt
executables and the worktree CLI. The large-org runner compiles manifests;
it does not materialise the closed cyclic graph in the warehouse.

Ensure that the pinned release, main and draft objects are available:

```bash
git fetch --no-write-fetch-head origin main refs/tags/2.631.0 refs/pull/31284/head
```

Each invocation selects one pinned build and one flag state:

```bash
examples/multi-repo-dbt-sim/run-large-org --build pre --flag on
```

The build names are `pre`, `fixed`, `main`, `cycle-pr` and `integrated`. The flag is `off`
or `on`. The default runs all eleven variants. To split a run into bounded
batches, pass `--variants`:

```bash
examples/multi-repo-dbt-sim/run-large-org --build pre --flag on \
  --variants healthy cycle mixed one-arg
examples/multi-repo-dbt-sim/run-large-org --build pre --flag on \
  --variants cycle-nine missing-project missing-shared duplicate-project
examples/multi-repo-dbt-sim/run-large-org --build pre --flag on \
  --variants empty-selector unreadable combined
```

Completed rows survive in `.work/large-org/results/results.json`. The runner
replaces each selected build/flag/variant row on rerun and writes `SUMMARY.md`
with exact messages. Use `--out` for a separate result directory. The wrapper
holds the fixture lock and bounds each invocation. Build archives and their
checksum metadata stay under `.work/large-org/builds/`.

The local Git transport is the loopback HTTPS `git http-backend` server used
by the base harness. It serves the signed runtime repositories, uses a
URL-scoped temporary trust entry, and denies the selected unreadable source
with HTTP 403. It needs no remote repository or external token.

## Builds

| Build                         | Pinned revision                            | Includes #31313 |
| ----------------------------- | ------------------------------------------ | --------------- |
| `pre`, release `2.631.0`      | `c4d58411c3c551f1aa97ab1118d698f0ddd3b03f` | No              |
| `fixed`, #31313 merge         | `b4fbe779561f8077259dc6beb504f45b6dfe3238` | Yes             |
| `main`, task baseline         | `66a39c038857c709a1d628dbd0c530c5f558ab35` | Yes             |
| `cycle-pr`, draft #31284 head | `6e35424935013c5c2fc5ceb7174b4abca62a0014` | No              |

The release predates the [#31313 merge](https://github.com/lightdash/lightdash/pull/31313).
The comparison uses the exact [#31284 draft head](https://github.com/lightdash/lightdash/pull/31284),
without an integration merge. Branches and other worktrees are not changed.

## Image-faithful toolchains and integration build

All four pinned production Dockerfiles declare `dbt-core==1.12.0` for the
1.12 executable and install no dbt-loom. The adapter declarations use version
ranges. The image-faithful 7b runs therefore use dbt-core 1.12.0 without
server-side dbt-loom. The separate CI-style publication parser retains its
recorded dbt-loom environment. The result JSON records both, including actual
resolved adapter versions; an adapter range is not an exact image patch pin.

The fifth build combines current main
`66a39c038857c709a1d628dbd0c530c5f558ab35` and the tested #31284 head
`6e35424935013c5c2fc5ceb7174b4abca62a0014`. Its local signed revision is
`4fdf8527df6f7edc064e4494e37bc2068af3c7fe`, with tree
`e3201e56e3b5f0d61172fdc0e75e1b2bd980a656`.

`integration_build.py` uses `git merge-tree` and a signed `commit-tree` in
this T3 harness worktree. It changes no branch ref and makes no push or PR
merge. The two additive conflicts keep main's source-skipping function and
the draft's package-target and cycle-check functions unchanged. The call site
runs source skipping, then cycle validation. This is a local integration of
the two upstream changes, not a new product fix. Cached metadata records the
base, draft head, tree and resolved-source checksum. A fresh local run can
reconstruct the same tree; its signed commit ID can differ.

## Scenario expectations

Each variant isolates a trigger. `combined` enables all triggers to show
which error masks the others. A configured trigger counts as observed only
when the run records its diagnostic or denied Git request.

| Variant             | Expected check                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| `healthy`           | The legal project ring has no closed model loop.                        |
| `cycle`             | Detect the five-model loop through `transactions_x.v3`.                 |
| `cycle-nine`        | Detect the synthetic eleven-model loop across nine projects.            |
| `mixed`             | Reproduce stale retries before #31313; test the fixed binding after it. |
| `one-arg`           | Test the duplicated-name binding without a qualified ref to that name.  |
| `missing-project`   | Report a ref to disconnected `proj_unconnected`.                        |
| `missing-shared`    | Report a ref to disconnected `shared_dims`.                             |
| `duplicate-project` | Connect the primary Git remote twice and report duplicate ownership.    |
| `empty-selector`    | Select a missing tag and record the result.                             |
| `unreadable`        | Deny the remote for `proj_m` and record the refresh failure.            |
| `combined`          | Record the first visible failure and the masked triggers.               |

Items 1 and 9 apply to every row: 19 connected sources and the 3 GiB
source-fetch budget with concurrency four. Near project names and duplicated
model names remain present in the control. Their presence alone is not proof
that a corresponding failure fired. The exact per-item flags and before/after
source counts are retained in the JSON report.

## Pre-fix reproduction gate

Release `2.631.0`, with cross-source refs enabled, reproduces the versioned
cycle error:

```text
dbt models form a cycle across dbt sources: model.proj_a.staging_x -> model.proj_b.transactions_x.v3 -> model.proj_b.curated_x -> model.proj_c.mart_x -> model.proj_a.reporting_x -> model.proj_a.staging_x. Break the cycle in one of these models.
```

The same build reproduces the retry error in the `mixed` variant:

```text
dbt source "proj_growth" was compiled against an out-of-date version of model "model_shared" from dbt source "dbt_project" and the compile ran out of retries. Refresh again; the next compile usually succeeds.
```

It also reproduces the retry error in `one-arg`, which has no qualified ref
to the duplicated `model_shared` name:

```text
dbt source "proj_growth" was compiled against an out-of-date version of model "model_shared" from dbt source "dbt_project" and the compile ran out of retries. Refresh again; the next compile usually succeeds. dbt source "proj_growth" was compiled against an out-of-date version of model "model_shared" from dbt source "analyst_hub" and the compile ran out of retries. Refresh again; the next compile usually succeeds.
```

The runtime warning identifies the binding to the other source:

```text
dbt.compile.crossSourceRefWarning Model "consumer_1" in dbt source "proj_growth" uses ref('model_shared'), which resolved to external model model.analyst_hub.model_shared from another dbt source. Use ref('analyst_hub', 'model_shared') to make the cross-source reference explicit.
```

With the flag disabled, the pre-fix path instead reports duplicate imported
model ownership before it reaches either target error. This difference is a
reproduction limit for the requested flag-off setup. The flag-on evidence
meets the two-error gate; it does not establish flag-off parity.

## Observed build and flag matrix

All 88 refresh actors and API flag states are verified. The final Inspector
observations provide every counter. All 44 flag-on observations agree with
the product logs. The totals are 1,206 evictions and 599 re-fetches. Counts
below sum the eleven variants in each build/flag combination.

| Build    | Flag | Clean success | Partial success | Failed | Cycle error | Mixed retry error | One-arg retry error | Evictions / re-fetches |
| -------- | ---- | ------------: | --------------: | -----: | ----------- | ----------------- | ------------------- | ---------------------- |
| pre      | OFF  |             0 |               0 |     11 | no          | no                | no                  | 0 / 0                  |
| pre      | ON   |             2 |               0 |      9 | yes         | yes               | yes                 | 298 / 146              |
| fixed    | OFF  |             0 |               0 |     11 | no          | no                | no                  | 0 / 0                  |
| fixed    | ON   |             3 |               0 |      8 | yes         | no                | yes                 | 296 / 145              |
| main     | OFF  |             0 |               0 |     11 | no          | no                | no                  | 0 / 0                  |
| main     | ON   |             3 |               3 |      5 | yes         | no                | yes                 | 315 / 162              |
| cycle-pr | OFF  |             0 |               0 |     11 | no          | no                | no                  | 0 / 0                  |
| cycle-pr | ON   |             2 |               0 |      9 | yes         | yes               | yes                 | 297 / 146              |

The flag-off path does not reach the cross-source resolver in these inputs.
It rejects imported model ownership, or an earlier missing-project error in
the combined variant. Its final counters are measured zeros, not the initial
zero counters from `sourceFetchStart`. This prevents a claim of complete
parity with an incident reported with that flag off.

The flag-on healthy control succeeds with 49 explores on every build.
The missing selector succeeds with 48 explores on every build. There is no
selection error in those runs. On main, disconnected-project and shared
dimensions variants finish with warnings and 47 explores. An unreadable
source finishes with a warning and 48 explores. These are partial successes,
not clean compilations. The other builds fail those three cases.

Main initially needed two newer schema migrations. They were applied
unchanged through Knex to this worktree's stopped, verified local database:
`20261021160000_add_explore_name_allocations.ts` and
`20261021180000_add_explore_name_reservations.ts`. The affected main rows were
rerun. Earlier schema failures are excluded from the final matrix and remain
only in ignored diagnostic records.

## Per-variant observations

The [JSON report](reports/large-org.json) retains each exact error, connection
warning, actor check, flag check, timestamp and before/after source count.
The item numbers refer to the requested setup. A number in the final column
means its diagnostic or denied request was observed. Configured but masked
triggers are not counted as observed. The duplicate-name condition in item 6
is distinguished from ordinary qualified names.

| Build    | Flag | Variant           | Result  | Explores before → after | Cycle / stale | Evictions / re-fetches | Items observed |
| -------- | ---- | ----------------- | ------- | ----------------------- | ------------- | ---------------------- | -------------- |
| pre      | OFF  | healthy           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | cycle             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | mixed             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | one-arg           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | ON   | healthy           | success | 0 → 49                  | no / no       | 32 / 18                | 1, 9           |
| pre      | ON   | cycle             | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| pre      | ON   | mixed             | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| pre      | ON   | one-arg           | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| pre      | ON   | cycle-nine        | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| pre      | ON   | missing-project   | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 3, 9        |
| pre      | ON   | missing-shared    | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 4, 9        |
| pre      | ON   | duplicate-project | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 6, 9        |
| pre      | ON   | empty-selector    | success | 0 → 48                  | no / no       | 32 / 18                | 1, 9           |
| pre      | ON   | unreadable        | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 8, 9        |
| pre      | ON   | combined          | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 8, 9        |
| pre      | OFF  | cycle-nine        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | missing-project   | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 3, 9        |
| pre      | OFF  | missing-shared    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 4, 9        |
| pre      | OFF  | duplicate-project | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | empty-selector    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| pre      | OFF  | unreadable        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 8, 9        |
| pre      | OFF  | combined          | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 4, 9        |
| fixed    | OFF  | healthy           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | cycle             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | mixed             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | one-arg           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | cycle-nine        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | missing-project   | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 3, 9        |
| fixed    | OFF  | missing-shared    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 4, 9        |
| fixed    | OFF  | duplicate-project | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | empty-selector    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| fixed    | OFF  | unreadable        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 8, 9        |
| fixed    | OFF  | combined          | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 3, 9        |
| fixed    | ON   | healthy           | success | 0 → 49                  | no / no       | 32 / 18                | 1, 9           |
| fixed    | ON   | cycle             | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| fixed    | ON   | mixed             | success | 0 → 49                  | no / no       | 32 / 18                | 1, 9           |
| fixed    | ON   | one-arg           | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| fixed    | ON   | cycle-nine        | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| fixed    | ON   | missing-project   | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 3, 9        |
| fixed    | ON   | missing-shared    | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 4, 9        |
| fixed    | ON   | duplicate-project | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 6, 9        |
| fixed    | ON   | empty-selector    | success | 0 → 48                  | no / no       | 32 / 18                | 1, 9           |
| fixed    | ON   | unreadable        | failure | 0 → 0                   | no / no       | 13 / 0                 | 1, 8, 9        |
| fixed    | ON   | combined          | failure | 0 → 0                   | no / no       | 13 / 0                 | 1, 8, 9        |
| main     | OFF  | healthy           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | cycle             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | mixed             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | one-arg           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | cycle-nine        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | missing-project   | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | missing-shared    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | duplicate-project | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | empty-selector    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | OFF  | unreadable        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 8, 9     |
| main     | OFF  | combined          | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 8, 9     |
| cycle-pr | OFF  | healthy           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | cycle             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | mixed             | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | one-arg           | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| main     | ON   | healthy           | success | 49 → 49                 | no / no       | 32 / 18                | 1, 9           |
| main     | ON   | cycle             | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| main     | ON   | mixed             | success | 49 → 49                 | no / no       | 32 / 18                | 1, 9           |
| main     | ON   | one-arg           | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| main     | ON   | cycle-nine        | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| main     | ON   | missing-project   | partial | 0 → 47                  | no / no       | 32 / 18                | 1, 3, 9        |
| main     | ON   | missing-shared    | partial | 0 → 47                  | no / no       | 32 / 18                | 1, 4, 9        |
| main     | ON   | duplicate-project | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 6, 9        |
| main     | ON   | empty-selector    | success | 0 → 48                  | no / no       | 32 / 18                | 1, 9           |
| main     | ON   | unreadable        | partial | 0 → 48                  | no / no       | 31 / 17                | 1, 8, 9        |
| main     | ON   | combined          | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 6, 8, 9     |
| cycle-pr | OFF  | cycle-nine        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | missing-project   | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 3, 9        |
| cycle-pr | OFF  | missing-shared    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 4, 9        |
| cycle-pr | OFF  | duplicate-project | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | empty-selector    | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 6, 9        |
| cycle-pr | OFF  | unreadable        | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 8, 9        |
| cycle-pr | OFF  | combined          | failure | 0 → 0                   | no / no       | 0 / 0                  | 1, 3, 9        |
| cycle-pr | ON   | healthy           | success | 0 → 49                  | no / no       | 32 / 18                | 1, 9           |
| cycle-pr | ON   | cycle             | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| cycle-pr | ON   | mixed             | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| cycle-pr | ON   | one-arg           | failure | 0 → 0                   | no / yes      | 32 / 19                | 1, 5, 9        |
| cycle-pr | ON   | cycle-nine        | failure | 0 → 0                   | yes / no      | 32 / 18                | 1, 2, 9        |
| cycle-pr | ON   | missing-project   | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 3, 9        |
| cycle-pr | ON   | missing-shared    | failure | 0 → 0                   | no / no       | 32 / 18                | 1, 4, 9        |
| cycle-pr | ON   | duplicate-project | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 6, 9        |
| cycle-pr | ON   | empty-selector    | success | 0 → 48                  | no / no       | 32 / 18                | 1, 9           |
| cycle-pr | ON   | unreadable        | failure | 0 → 0                   | no / no       | 14 / 0                 | 1, 8, 9        |
| cycle-pr | ON   | combined          | failure | 0 → 0                   | no / no       | 13 / 0                 | 1, 8, 9        |

## Findings

The mixed-ref retry failure is fixed by #31313 in these runs. Its warning
remains after a successful refresh. A warning alone therefore does not prove
a stale-ref failure. Reproduce with `--variants mixed --flag on` on each build.

The one-argument-only duplicated-name binding still exhausts retries on the
#31313 merge and main. It has no qualified ref to `model_shared`; it does
have a qualified ref to the different `model_other`. Its error checks both
the primary `dbt_project` and `analyst_hub`. The trailing advice to refresh
again is present on pre and the tested #31284 head, but absent on fixed and
main. The error itself remains on all four.

Both closed model cycles remain errors on all four flag-on builds. The
versioned model ID appears in the exact cycle path. The tested #31284 head
does not make that graph compile. No PR is known to make this cyclic model
graph valid. The legal project ring remains a separate successful control.

The initial compile can publish healthy sources on main when a missing or
unreadable source fails. These fresh-project variants do not test carrying
last-good explores from an earlier successful refresh. The original fixture
has a separate last-good scenario. Combined failures mask later triggers,
so isolated variants are needed to attribute each diagnostic. Last-good
manifests used to climb a consumer refresh are a different proof: see
[last-good-climb/README.md](last-good-climb/README.md). Run 7b's `.v2`
binding is not that proof.

A later harness-only probe measured last-good artefact bytes and climb RSS
on this same `healthy` profile, plus the full 22-source generator. It did
not refresh a server project. The recorded command is
`examples/multi-repo-dbt-sim/run-last-good-scale --fixture both`. RSS is
`/usr/bin/time -v` maximum resident set size in kilobytes, times 1024, for
one process at a time. The timed climb injects models, seeds, and
snapshots with `access: public`. Fixture seeds have no access and there
are no snapshots, so the recorded inject counts are unchanged. On `healthy`
that was 19 sources, 49 models, 10321720 artefact bytes, climb RSS
133611520 bytes, and climb parse 2.53 seconds,
with 0 non-public models omitted. The serial stubbed parse of the same
checkouts took 48.577 seconds, with peak RSS 133357568 bytes and 125473
checkout bytes. The full fixture was 22 sources, 3000 logical models,
24698281 artefact bytes, climb RSS 178114560 bytes, and 4.224 seconds,
against a 70.394 second serial baseline whose peak RSS was 188633088 bytes.
The earlier inject-all run injected the same 44 and 2901 nodes. Per-source
figures are in [reports/last-good-scale.json](reports/last-good-scale.json).

The disk budget derives a limit of eleven, but chosen concurrency is four
and the pool resident capacity is four. The 19-source profiles use small
repositories; they do not fill the disk with 3 GiB of model files. The source
budget uses the product's per-source allowance. Individual successful and resolver
failure rows generally record 32 evictions and 18 or 19 re-fetches. This is
source churn under the configured budget, not evidence that eleven sources
were resident at once. A re-fetch is the product's `diskRecreations` count;
Git discovery requests also include validation and failed attempts.

The report includes server connection warnings from the completed job. This
matters on main: the disconnected-project warning is in `jobResults`, while
the generic source-skipped log does not name the missing project. Per-item
classification uses both captured sources and does not require a new run.

## Closed-ring control and ambiguous-version follow-up

Run 7 is a deliberately closed fourteen-model cycle across `proj_bank`,
`proj_payments` and `proj_analyst`. It is a control for detecting a real
cycle. It does not test a false cycle. All four versioned edges pin `v=3`:

| Consumer                              | Ref                                          | Correct target                           |
| ------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| `proj_bank.stg_bank_accounts`         | `ref('proj_payments', 'transactions', v=3)`  | `model.proj_payments.transactions.v3`    |
| `proj_payments.mart_payment_accounts` | `ref('proj_analyst', 'segment_cohort', v=3)` | `model.proj_analyst.segment_cohort.v3`   |
| `proj_analyst.segment_cohort`         | `ref('segment_activity', v=3)`               | `model.proj_analyst.segment_activity.v3` |
| `proj_analyst.segment_activity`       | `ref('segment_value', v=3)`                  | `model.proj_analyst.segment_value.v3`    |

The other edges target distinct unversioned models. The `_v3` and `_v2`
decoys are unversioned leaves outside the loop. There are no ambiguous edges
in this control. A cycle failure is the expected result on all four builds.

Run 7b changes the bank-to-payments edge to
`ref('proj_payments', 'transactions')`: two arguments and no version. The
fresh provider declares latest version 2 and that model is a leaf. A stale,
real published manifest declares latest version 3, which enters the control
path. The intended current binding is
`model.proj_payments.transactions.v2`. The fresh model graph is acyclic.
The fixture records both publication states and the initial consumer binding.

The correct semantic result for 7b is success on every build. The regression
hypothesis is that a build before #31284 can retain the stale `.v3` binding
and fail, while #31284 retries with the current binding. This is a hypothesis
to test, not a result inferred from the PR description. The closed control is
retained to distinguish valid cycle detection from that potential false edge.

| Build          | Run 7 control expectation | Run 7b semantic expectation |
| -------------- | ------------------------- | --------------------------- |
| `2.631.0`      | Cycle error               | Success with `.v2`          |
| `#31313` merge | Cycle error               | Success with `.v2`          |
| Pinned main    | Cycle error               | Success with `.v2`          |
| `#31284` head  | Cycle error               | Success with `.v2`          |

## Run 7 observed results

The profile has 19 sources and 41 model nodes. Real dbt bootstrap parses
verify the four `.v3` IDs and both unversioned decoys. The
[run 7 JSON](reports/prod-shaped.json) records the full control graph, exact
messages, expectation checks and ordered compile events.

| Build    | Closed-cycle control  | Mixed refresh        | Warning | Stale error | Warning before error | Trailing advice | Target assertions |
| -------- | --------------------- | -------------------- | ------- | ----------- | -------------------- | --------------- | ----------------- |
| pre      | Cycle error, expected | failure, 0 explores  | yes     | yes         | yes                  | yes             | PASS              |
| fixed    | Cycle error, expected | success, 41 explores | yes     | no          | no                   | no              | PASS              |
| main     | Cycle error, expected | success, 41 explores | yes     | no          | no                   | no              | PASS              |
| cycle-pr | Cycle error, expected | failure, 0 explores  | yes     | yes         | yes                  | yes             | FAIL              |

The `cycle-pr` mixed target fails: this head does not include #31313. It
retains both the retry error and its trailing advice. That is a failed
comparison target, not evidence that #31313 regressed. Fixed and main pass
the exact-advice-absent assertion. All four cycle controls pass their
expected-error assertions. Seven of the eight case assertions pass.

All four builds emit this exact cycle error:

```text
dbt models form a cycle across dbt sources: model.proj_bank.int_bank_accounts -> model.proj_bank.stg_bank_accounts -> model.proj_payments.transactions.v3 -> model.proj_payments.int_payment_events -> model.proj_payments.stg_payment_events -> model.proj_payments.mart_payment_accounts -> model.proj_analyst.segment_cohort.v3 -> model.proj_analyst.segment_activity.v3 -> model.proj_analyst.segment_value.v3 -> model.proj_analyst.int_segment_members -> model.proj_analyst.stg_segment_members -> model.proj_analyst.mart_segment_accounts -> model.proj_analyst.reporting_bank -> model.proj_bank.mart_bank_summary -> model.proj_bank.int_bank_accounts. Break the cycle in one of these models.
```

Pre and cycle-pr emit this exact mixed-ref error:

```text
dbt source "proj_growth" was compiled against an out-of-date version of model "mart_merchant__merchants" from dbt source "dbt_project" and the compile ran out of retries. Refresh again; the next compile usually succeeds.
```

All four mixed runs emit this exact warning:

```text
Model "consumer_one_arg" in dbt source "proj_growth" uses ref('mart_merchant__merchants'), which resolved to external model model.proj_analyst.mart_merchant__merchants from another dbt source. Use ref('proj_analyst', 'mart_merchant__merchants') to make the cross-source reference explicit.
```

The warning precedes the error in the same measured compile on pre
(23:22:26 → 23:22:34 UTC) and cycle-pr (23:28:57 → 23:29:06 UTC).
Two fetch events and the resolver summary intervene; adjacency is not
required. The warning remains on fixed and main, with no stale error.

## Run 7b initial toolchain result

The [run 7b JSON](reports/prod-ambiguous-version.json) records four server
refreshes and real normal-parse evidence. The old publication declares
latest version 3; the fresh publication declares latest version 2. Actual
consumer parses bind to `.v3` with the stale publication and `.v2` with the
fresh publication. The fresh combined graph has 42 model nodes, no unresolved
model dependencies and no cycle.

The initial toolchain is dbt-core 1.12.3, dbt-postgres 1.10.0 and dbt-loom
0.9.6. Every build fails before the cycle check during external-node injection:

```text
[ERROR]: Encountered an error:
'ModelNodeArgs' object has no attribute 'group'
```

The exact service error is the same on all four builds:

```text
dbt source "dbt_project" failed: Failed to run "dbt1.12 ls --output json --output-keys unique_id" with dbt version "v1.12". dbt source "proj_analyst" references ref('proj_bank', 'mart_bank_summary') from dbt source "dbt_project", which failed with this root cause. dbt source "proj_growth" references ref('proj_bank', 'model_other') from dbt source "dbt_project", which failed with this root cause.
```

The success target fails on all four. Final binding is unavailable because
no merged manifest is persisted. No cross-source warning, cycle error or
stale-retry error is emitted. This is an inconclusive false-cycle comparison,
not evidence that all four builds contain a false-cycle bug. The initial
blocked results are retained as a development-toolchain comparison. The later
image-faithful results below supersede that inconclusive comparison. No product
or dependency source patch is included.

## Image-faithful run 7b and combined-build results

The [four-build image-faithful JSON](reports/prod-ambiguous-version-image.json)
and [combined-build JSON](reports/integrated-image.json) record every measured
runtime version, source-file hash and pin excerpt next to its result. All
seven assertion sets pass. All actors, API flags and final Inspector counters
are verified. Every row records 32 evictions and 18 re-fetches.

| Build      | Revision                                   | Main base                                  | Server core | Server loom   | 7b result | Final binding                         |
| ---------- | ------------------------------------------ | ------------------------------------------ | ----------- | ------------- | --------- | ------------------------------------- |
| pre        | `c4d58411c3c551f1aa97ab1118d698f0ddd3b03f` | n/a                                        | 1.12.0      | Not installed | PASS      | `model.proj_payments.transactions.v2` |
| fixed      | `b4fbe779561f8077259dc6beb504f45b6dfe3238` | n/a                                        | 1.12.0      | Not installed | PASS      | `model.proj_payments.transactions.v2` |
| main       | `66a39c038857c709a1d628dbd0c530c5f558ab35` | n/a                                        | 1.12.0      | Not installed | PASS      | `model.proj_payments.transactions.v2` |
| cycle-pr   | `6e35424935013c5c2fc5ceb7174b4abca62a0014` | n/a                                        | 1.12.0      | Not installed | PASS      | `model.proj_payments.transactions.v2` |
| integrated | `4fdf8527df6f7edc064e4494e37bc2068af3c7fe` | `66a39c038857c709a1d628dbd0c530c5f558ab35` | 1.12.0      | Not installed | PASS      | `model.proj_payments.transactions.v2` |

The resolved Postgres adapter is 1.10.2, within the declared `~=1.10.0`
range. Python is 3.11.16. The complete production adapter requirement list
is recreated in a separate private venv. Core is exactly pinned; adapter and
transitive patch versions are current resolver outcomes, not a historical
image freeze. No product or dependency source patch is used.

The server uses no dbt-loom because the image does not install it. The
publication parser remains dbt-core 1.12.3 with dbt-loom 0.9.6 and Postgres
1.10.0. The stale/fresh publications and parse evidence remain unchanged.
The earlier `group` error is specific to the development toolchain tested
with server-side dbt-loom. It is not reproduced with the image recipe and
must not be reported as a shipped-image failure.

All five image-faithful 7b runs succeed. Each persisted merged manifest from
that refresh contains the `.v2` binding. The ambiguous latest-version probe
therefore does not reproduce a false cycle on any tested build. It does not
show a #31284-specific fix. The stale publication proves an opportunity for
a wrong initial binding in a consumer parse; it does not prove that the
server follows that stale edge with the shipped toolchain.

| Combined build case      | Observed              | Assertion |
| ------------------------ | --------------------- | --------- |
| `prod-cycle`             | Cycle error, expected | PASS      |
| `prod-mixed`             | Success, 41 explores  | PASS      |
| `prod-ambiguous-version` | Success, 41 explores  | PASS      |

The local combined build includes both changes. Its mixed case retains the
cross-source warning but has no retry error or trailing advice. Its explicit
fourteen-model ring remains a valid cycle error. The 85 focused archived
cross-source unit tests pass in one test file. This validates the local
integration without changing or pushing the draft branch.

To repeat the image-faithful cases, prepare a separate Python 3.11 venv from
the selected revision's production `dockerfile` dbt1.12 requirement stanza.
Keep dbt-core exactly 1.12.0 and do not add dbt-loom to that server venv.
Record the resolved packages. Keep the normal publication venv separate.
Pass the prepared server executable explicitly:

```bash
examples/multi-repo-dbt-sim/run-large-org --build pre --flag on \
  --server-dbt "$PWD/examples/multi-repo-dbt-sim/.work/venvs/dbt-image-1120/bin/dbt" \
  --variants prod-ambiguous-version \
  --out examples/multi-repo-dbt-sim/.work/large-org/prod-ambiguous-version-image
examples/multi-repo-dbt-sim/run-large-org --build integrated --flag on \
  --server-dbt "$PWD/examples/multi-repo-dbt-sim/.work/venvs/dbt-image-1120/bin/dbt" \
  --variants prod-cycle prod-mixed \
  --out examples/multi-repo-dbt-sim/.work/large-org/integrated-image
examples/multi-repo-dbt-sim/run-large-org --build integrated --flag on \
  --server-dbt "$PWD/examples/multi-repo-dbt-sim/.work/venvs/dbt-image-1120/bin/dbt" \
  --variants prod-ambiguous-version \
  --out examples/multi-repo-dbt-sim/.work/large-org/integrated-image
```

Use the same command with `fixed`, `main` and `cycle-pr`. The optional
`--toolchain-provenance PATH` reads a build-keyed JSON object with the source
pin evidence and rejects a SHA mismatch. The runner always records and
checks the live API's executable resolution and venv versions.

## Validation and cleanup

The final fixture suite runs 48 tests with four existing opt-in skips.
Ruff check/format, repository Oxfmt/Oxlint, shell syntax and diff checks pass.
The combined archive passes 85 focused tests in one file. The seven final
image-faithful rows pass actor, flag, counter and binding assertions.
The original 88 matrix rows and eight run-7 rows are preserved. Four initial
development-toolchain 7b failures remain as a labelled comparison. No
arbitrary-version probe contributes to the reported outcomes.

All owned app, runner, observer and Git-server processes are stopped.
Disposable local projects and ignored artifacts remain for inspection.
The integration revision is local and unpushed.

## Behaviour changes and compatibility

None. The changes are dev-only fixtures, scripts and reports. They are not
copied into the production or preview Docker images or published npm
packages. Product source is unchanged. All runtime inputs and seed rows are
synthetic.

Refs #31323
Refs #31113
