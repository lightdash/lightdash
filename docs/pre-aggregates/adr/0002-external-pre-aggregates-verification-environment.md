# External pre-aggregates are verified against generated-SQL matviews in the jaffle demo

Before implementing external pre-aggregates ([ADR-0001](./0001-external-pre-aggregates-serve-from-project-warehouse.md)), we need a local
environment where serving from an external table can be verified end to end.
We decided to build it in the full-jaffle-shop-demo dbt project, on the
`orders` explore, with two customer-managed Postgres materialized views in the
`jaffle` warehouse schema.

Two external pre-aggregate definitions exist in
`examples/full-jaffle-shop-demo/dbt/models/orders.yml`, each declaring its
matview via the `table` key:

| Definition | External table | Covers |
|---|---|---|
| `orders_ext_daily_status` | `jaffle.orders_ext_daily_status_mv` | plain dims (`status`, `order_source`), additive metric, decomposable avg (`__sum`/`__count`), `order_date` day grain |
| `orders_ext_daily_joined` | `jaffle.orders_ext_daily_joined_mv` | joined dimension (`customers.first_name`), filtered-sum metric |

Both are strict subsets of the managed `orders_daily_avg_demo_2`, so
"smallest pre-aggregate wins" must route matching queries to the external
definitions — a hit is attributable without ambiguity.

**The matview bodies are the Lightdash-generated materialization queries,
copied verbatim** (minus `ORDER BY`/`LIMIT`): each definition was first
registered as managed, materialized, and its compiled SQL read from
`query_history.compiled_sql` via the materialization's `query_uuid`. This
guarantees conformance to the generated column contract by construction, and
means external-served results must equal warehouse results exactly. The same
trick is the recommended path for customers building their own external
tables.

The DDL lives in a dbt macro
(`examples/full-jaffle-shop-demo/dbt/macros/external_pre_aggregates.sql`)
wired as `on-run-end` in `dbt_project.yml`, because dbt table rebuilds drop
the matviews via `CASCADE` — every `dbt run`/`build` drops and recreates them
with fresh data. Postgres-only, guarded on `target.type`.

## Considered options

- **Matviews as dbt models** (`materialized: materialized_view`) — rejected;
  they would become Lightdash explores on deploy, and external tables are by
  definition outside the Lightdash project.
- **Hand-written rollup SQL** — rejected; contract drift between hand-written
  columns and generated fieldIds is exactly the failure mode the env must not
  have.
- **SQL script in the seed flow** — rejected; the app-db seed never rebuilds
  the `jaffle` schema, dbt does, so the hook is the only place that tracks the
  warehouse lifecycle.

## Consequences

- After changing the demo models/YAML, redeploy with
  `curl -X POST -H "Authorization: ApiKey $LIGHTDASH_API_KEY" "$LIGHTDASH_URL/api/v1/projects/<uuid>/refresh"`
  (or "Refresh dbt" in the UI); definition registration and materialization
  follow automatically.
- When the `table` key lands, verification is: add `table:` to the two
  definitions, redeploy, and assert (1) served results equal the
  matview-disabled warehouse results, (2) the served SQL selects from the
  matview fragment, (3) hits are recorded in pre-aggregate analytics.
- If the definitions change shape, the matview bodies must be regenerated with
  the same managed-first trick — they do not track YAML automatically.
