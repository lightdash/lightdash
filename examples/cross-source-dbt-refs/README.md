# Cross-source dbt refs fixture

Two dbt projects that live in separate repositories in real life:

- `shared_dimensions` owns `dim_calendar` (a public model).
- `analytics` owns `fct_orders`, which selects from
  `{{ ref('shared_dimensions', 'dim_calendar') }}` using the dbt-loom / dbt Mesh
  two-argument ref syntax.

Connect both as dbt sources of one Lightdash project (the `multi-dbt-sources`
feature flag). With the `cross-source-dbt-refs` feature flag on, the server
compile resolves the ref without dbt-loom: when the `analytics` source fails
with `depends on a node named 'dim_calendar' in package or project
'shared_dimensions' which was not found`, the compile injects the models of
the sources that already compiled through a generated dbt plugin and retries.

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
