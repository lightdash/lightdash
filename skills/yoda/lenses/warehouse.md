# Warehouse

## Review

- **Skip when:** no adapter code or dialect SQL changes (a warehouse-type check in a service is not dialect SQL), live data sources that touch no shared dialect code, or dbt git hosting (Integrations).
- **Worst case:** wrong SQL or a broken connection for one warehouse only, while the others pass.
- **Evidence:** read the SQL per dialect, and look for tests or a run against each affected warehouse.
- **dialects named:** the change states which warehouses it affects; shared SQL is checked for every dialect that uses it.
- **quoting and types:** identifiers, string literals, dates and timestamps are quoted and cast the adapter's way, never built by hand.
- **dbt versions:** every supported dbt version still parses the project (`scripts/setup-dbt-venvs.sh` covers them).
- **tenant variance:** settings that differ per customer (regions, execution projects, roles, SSH tunnels, key-pair auth) keep working, and existing connections still connect.
- **credentials:** secrets stay out of logs, errors and responses.

## Impact

- **breaking:** working connections, queries or dbt projects fail.
- **notable:** new warehouse/option/dialect behaviour or changed results.
- **minor:** same SQL/results.

## Diff

```ts
type WarehouseDiff = Diff & {
    warehouse: string;  // the warehouse, or all
};
```

- **Name:** the behaviour (`session start`, `table listing`).
- **Note:** what happens now.
- **Granularity:** one diff per behaviour and warehouse.

```json
{ "lens": "Warehouse", "change": "modified", "impact": "notable", "name": "session start", "warehouse": "Databricks", "note": "retries while Spark initialises" }
```
