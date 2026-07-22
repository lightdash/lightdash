# Apache Doris connector

Lightdash can connect to [Apache Doris](https://doris.apache.org/) (and Doris-compatible
managed services) as a warehouse. Doris speaks the MySQL wire protocol on its query port
(default `9030`), so the connector is built on the `mysql2` driver together with a
MySQL-style SQL dialect.

## Capabilities

- **Connection**: host / port / user / password / schema, plus optional timeout,
  SSH tunnel and "require user credentials".
- **Catalog & fields**: read from `information_schema.tables` / `information_schema.columns`.
- **Streaming queries**: canonical `mysql2` streaming with backpressure
  (`pause()` / `resume()`), parameterised placeholders to prevent SQL injection.
- **Dialect**: backtick-quoted identifiers, `DATETIME` (Doris has no `TIMESTAMP` type),
  `TIMESTAMPDIFF`, `INTERVAL`, `PERCENTILE(expr, p)` for median/percentile, array literals.
- **dbt**: uses the [`dbt-doris`](https://docs.getdbt.com/docs/local/connect-data-platform/doris-setup)
  adapter. A `doris` target is available in the demo project and in the built dbt venvs
  (`dbt1.10` / `dbt1.11`).

## Type mapping

Doris catalog types (as reported by `information_schema`) are mapped to Lightdash
dimension types:

| Doris type | Lightdash dimension |
|---|---|
| `boolean` | Boolean |
| `tinyint` / `smallint` / `int` / `bigint` / `largeint` / `float` / `double` / `decimal(v3)` | Number |
| `date` / `datev2` | Date |
| `datetime` / `datetimev2` | Timestamp |
| everything else | String |

## Connect in the UI

1. **Settings → Projects → Create new project → Connect manually**.
2. Pick **Apache Doris** as the warehouse and fill in:
   - **Host** – Doris FE host
   - **Port** – query port (MySQL protocol, usually `9030`)
   - **User** / **Password**
   - **Schema** – the Doris *database* (Doris addresses tables as `database.table`)
3. For the dbt connection, choose your usual method (GitHub / GitLab / CLI …).
   > When using the bundled Docker image, select **dbt 1.10 or 1.11** – those are the
   > venvs that ship with `dbt-doris`.

## Connect via dbt (`profiles.yml`)

```yaml
jaffle_shop:
  target: doris
  outputs:
    doris:
      type: doris
      host: "{{ env_var('DORIS_HOST', '127.0.0.1') }}"
      port: "{{ env_var('DORIS_PORT', '9030') | as_number }}"
      username: "{{ env_var('DORIS_USER', 'root') }}"
      password: "{{ env_var('DORIS_PASSWORD', '') }}"
      schema: "{{ env_var('SEED_SCHEMA', 'jaffle') }}"
```

## Verify the demo project

The `full-jaffle-shop-demo` example includes a `doris` target. With `dbt-doris`
installed you can seed and build against a Doris database:

```bash
cd examples/full-jaffle-shop-demo
export DORIS_HOST=... DORIS_PORT=9030 DORIS_USER=... DORIS_PASSWORD=... SEED_SCHEMA=jaffle
dbt seed --project-dir dbt --profiles-dir profiles --target doris
dbt run  --project-dir dbt --profiles-dir profiles --target doris
```

Then create an **Apache Doris** project in Lightdash pointing at the same database,
open Explore and run a query — the SQL panel shows the compiled Doris SQL
(backtick identifiers, `DATE_TRUNC(col, 'unit')`, `TIMESTAMPDIFF`, …).

## Tested against

This connector has been validated end-to-end (connection test, catalog introspection,
dbt seed/run and query execution) against a managed, MySQL-protocol-compatible Doris
service. Standard-SQL behaviour should be portable across Doris deployments; a few
edge cases (`startOfWeek` mapping, `STARTS_WITH` / `SPLIT_PART` / `LAST_DAY`
availability) are marked with `TODO(doris)` in the code for follow-up.
