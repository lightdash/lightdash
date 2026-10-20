# Cross-source dbt refs fixture

Two dbt projects that live in separate repositories in real life:

- `shared_dimensions` owns `dim_calendar` (a public model).
- `analytics` owns `fct_orders`, which selects from
  `{{ ref('shared_dimensions', 'dim_calendar') }}` using the dbt-loom / dbt Mesh
  two-argument ref syntax.

Connect both as dbt sources of one Lightdash project (the `multi-dbt-sources`
feature flag). With the `cross-source-dbt-refs` feature flag on, the server
compile resolves the ref without dbt-loom. Each source is prepared once (git
refresh and `dbt deps`), then scanned for its `dbt_project.yml` name, literal
refs (including versions and one-argument refs) and `dependencies.yml` projects.
All sources run in one pass with sibling stubs from the cache or scan. Project
cycles are allowed. The resolver checks bindings against fresh catalogues and
reruns only consumers whose bindings change. A hidden ref (built in a macro,
`{% set %}` or `var()`) is learnt from dbt's missing-node error and retried.
Only `dbt ls` runs again; preparation is reused. A cycle between actual model
or seed nodes fails with its ordered node path.

## Local run

```bash
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres
cd examples/cross-source-dbt-refs
dbt run --project-dir shared_dimensions --profiles-dir profiles
pip install dbt-loom
cd analytics && dbt run --profiles-dir ../profiles
```

`analytics/dbt_loom.config.yml` points at the upstream manifest so the same
projects also work locally with dbt-loom installed. The Lightdash CLI ignores
the stub nodes dbt-loom adds to the manifest.

## Topology projects

All projects use the `cross_source_refs` profile in `profiles/profiles.yml`.
The original topology models declare typed Lightdash dimensions, a primary
key and a metric. The cycle-only models use minimal public model schemas.
The topology fixtures use two-argument refs and need no warehouse connection
for `dbt ls` or `dbt parse`.

| Project                        | What it proves                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `shared_dimensions`            | Provides the public `dim_calendar` model.                                                                      |
| `analytics`                    | Resolves `fct_orders` against the shared calendar in the first pass.                                           |
| `chain_c`                      | Resolves `agg_orders_by_year` in the first pass with sibling placeholders.                                     |
| `diamond_left`                 | Resolves `left_days` against the shared calendar.                                                              |
| `diamond_right`                | Resolves `right_days` against the same calendar in the same round.                                             |
| `diamond_top`                  | Resolves `joined_days` in the first pass with both sibling placeholders.                                       |
| `cycle_a`                      | References `cycle_b.base_b` from `model_a`.                                                                    |
| `cycle_b`                      | References `cycle_a.base_a` from `model_b`, forming a legal project cycle.                                     |
| `ring_a`, `ring_b`, `ring_c`   | Resolve a three-project cycle with no model cycle in one pass.                                                 |
| `node_cycle_a`, `node_cycle_b` | Reject an actual model cycle and name its node path.                                                           |
| `missing_upstream`             | Reports `nowhere.ghost` when no connected source provides it.                                                  |
| `same_name_a`                  | Provides `customers` with a `customer_name` column.                                                            |
| `same_name_b`                  | Defines its own `customers` with an `is_downstream` column and references `same_name_a.customers`.             |
| `access_upstream`              | Provides public, default protected, grouped private, and versioned `dim_product` models.                       |
| `access_downstream`            | References public, explicit v2, and latest version models; protected and private refs are disabled by default. |

Bare-name collisions are governed by [#27611](https://github.com/lightdash/lightdash/issues/27611).
The harness records the result of `combineManifestSources` without setting a
policy for those collisions. It checks that each source retains its own model.
The same-name projects use separate schemas so dbt can distinguish their
physical relations.

## Real-dbt integration harness

From the repository root:

```bash
LIGHTDASH_TEST_DBT_EXECUTABLES=1.12=/usr/local/bin/dbt1.12 pnpm -F backend test src/projectAdapters/crossSourceRefs.realDbt.test.ts
scripts/cross-source-refs-matrix.sh
```

`LIGHTDASH_TEST_DBT_EXECUTABLES` accepts comma-separated `version=path` pairs.
The suite skips when the variable is unset. The matrix script discovers local
dbt installs and runs one version at a time. It is not part of CI.

The harness uses the real `DbtCliClient` and cross-source resolver. Each client
uses a temporary copy of its fixture, and the suite removes those copies and
the client target directories after each version. Restricted-model tests
enable `uses_protected` or `uses_private` only in their temporary copy.
Those copies disable versioned refs so access checks can run independently
of versioned-ref resolution.

Protected models resolve across projects through injected external nodes, as
they do with dbt-loom. Setting `restrict-access: true` in the consuming project's
`dbt_project.yml` does not change this behaviour. dbt checks protected access
against the referenced project's installed dependency configuration; injected
nodes do not provide that configuration. This is known dbt behaviour, not a
Lightdash regression.

The harness checks that protected refs resolve both with and without the
consumer setting. It retains protected rejection as a skipped case with an
explicit unsupported-feature reason. Private cross-project refs still reject
without `restrict-access`, and the harness asserts that rejection.

The profile reads `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` and
`SEED_SCHEMA`. The harness uses local development defaults for unset variables.
No model is built and no warehouse catalog is fetched.
