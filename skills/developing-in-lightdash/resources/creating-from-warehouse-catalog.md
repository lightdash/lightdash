# Creating a Pure Lightdash Project from a Warehouse Catalog

Use this workflow only when the exact prepared project has no usable dbt semantic layer and the requested outcome is a minimal, pure Lightdash project backed by existing warehouse tables. If a dbt project compiles and can be extended, use the normal dbt workflow instead.

Catalog inspection and aggregate profiling may use either the selected Lightdash project's server-side warehouse connection or an already-authenticated warehouse CLI session, such as Snowflake CLI, SnowSQL, or the Google Cloud `bq` tool, for read-only metadata and aggregate queries. Direct warehouse access does not remove the need to pin the prepared Lightdash project UUID for deployment.

Never request, read, print, copy, or edit warehouse credentials. Do not inspect `.env`, `profiles.yml`, Snowflake/GCP configuration files, secret stores, or connection payloads. Do not run login/authentication commands or pass passwords, keys, tokens, or service-account files on the command line. Use a CLI connection only when it is already authenticated and authorized for the intended warehouse. Do not run `lightdash set-warehouse` unless the user separately asks to change the Lightdash connection.

## Required references

Read these resources before writing models:

- [Bundled model-as-code schema](./schemas/model-as-code-1.0.json) for the authoritative YAML shape
- [CLI reference](./cli-reference.md) for catalog, SQL, compile, deploy, and validation commands
- [Dimensions reference](./dimensions-reference.md), [metrics reference](./metrics-reference.md), and [joins reference](./joins-reference.md) for semantic configuration

## 1. Pin the prepared project

Work only inside the directory the user prepared. Do not search sibling projects for credentials or copy a semantic layer from an unrelated repository.

```bash
pwd
git status --short
find . -maxdepth 3 -type f \( -name 'dbt_project.yml' -o -name 'lightdash.config.yml' -o -path '*/lightdash/models/*.yml' \) -print
lightdash config get-project
```

Record the selected project UUID as `EXPECTED_PROJECT_UUID`. If the selected project is not the intended one, stop before querying or deploying. A pure project needs `lightdash.config.yml` with the confirmed warehouse type. Preserve the existing file; if it is missing or has no warehouse type, obtain the non-secret warehouse type from prepared project metadata or the user and add only the minimum config. Never infer it from table names.

Treat an existing pure Lightdash project additively. Inventory its model names, filenames, dimensions, metrics, joins, and config before making changes. Do not replace the `lightdash/` directory or overwrite unrelated YAML.

## 2. Infer the relevant modeling layer

Use database, schema, and table names across the catalog to identify the intended production-facing layer before inspecting fields. Look for consistent environment or transformation patterns such as `dev`/`staging`/`prod`, `raw`/`intermediate`/`marts`, or parallel schemas with the same base table names.

- When a consistent environment pattern exists, choose the `prod`, published, or mart relation and exclude its `dev`, staging, raw, temporary, backup, and test counterparts.
- Prefer curated business relations over ingestion or transformation internals.
- If no production-facing layer can be inferred reliably, ask the user which database/schema contains approved analytics tables before continuing.
- Never model warehouse system catalogs, account-usage schemas, or administrative access-control objects such as warehouse users, roles, grants, privileges, sessions, query history, or billing metadata.
- Distinguish system/admin user tables from a curated business-domain table that happens to be named `users`; use its database/schema context and neighboring relations, not the table name alone.

Choose the smallest coherent set of production-facing business relations suggested by those names. Field metadata and aggregate profiling must confirm their grain and usefulness before YAML is written. Do not assign business meaning from a name alone.

## 3. Select the existing connection path

Prefer the selected Lightdash project's connection when it works because `lightdash warehouse-catalog` returns normalized Lightdash field types. If that path is unavailable or incomplete, ask the user which warehouse CLI they already use for this connection. If the user already named a CLI, use that answer. Do not guess or probe every possible client.

Check only whether the user-selected command and existing session are usable:

```bash
command -v lightdash
command -v <user_selected_warehouse_cli>
```

If there is no usable Lightdash catalog connection and the user has no authenticated warehouse CLI, stop: the catalog cannot be inspected safely, so this workflow cannot continue. Do not initiate an authentication flow.

Use one connection path consistently for a profiling pass so catalog names, permissions, and query context do not silently differ. Record the warehouse/database context and current role visible from non-secret session metadata. Regardless of that role's permissions, execute only read-only metadata and aggregate queries. Never change roles, projects, warehouses, or billing projects without user authorization.

When using a direct CLI, confirm that `lightdash.config.yml` names the same warehouse adapter and that the pinned Lightdash project is intended to query the same warehouse/database context. The direct CLI supplies evidence for the YAML; it does not configure the Lightdash project's warehouse connection. If the contexts cannot be matched without inspecting secrets, stop and ask the user to confirm the non-secret target context.

## 4. Inspect the raw catalog

### Through Lightdash

Refresh once only when the catalog may be stale. Use JSON so names and Lightdash types are deterministic.

```bash
lightdash warehouse-catalog --refresh --json
lightdash warehouse-catalog --database <exact_database> --schema <exact_schema> --json
lightdash warehouse-catalog --database <exact_database> --schema <exact_schema> --table <exact_table> --include-fields --json
```

Run the field command separately only for shortlisted production-facing tables. The catalog's normalized field type is the starting point for every dimension type; do not guess types from names. Keep catalog output out of version control and remove temporary output after use.

### Through an already-authenticated Snowflake CLI

Use read-only metadata statements with the existing connection. `snow sql` is preferred when installed; SnowSQL may execute the equivalent statements.

```bash
snow sql --format json -q 'SELECT CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE();'
snow sql --format json -q 'SHOW SCHEMAS IN DATABASE "<exact_database>";'
snow sql --format json -q 'SHOW TABLES IN SCHEMA "<exact_database>"."<exact_schema>";'
snow sql --format json -q 'DESCRIBE TABLE "<exact_database>"."<exact_schema>"."<exact_table>";'
```

Do not add `--connection`, account, user, authenticator, password, or key flags unless the user already supplied a named non-secret connection choice for this task. Never use DDL, DML, `USE ROLE`, or `USE WAREHOUSE` in this workflow.

### Through an already-authenticated Google Cloud CLI

Use `bq` metadata commands for discovery and GoogleSQL for profiling.

```bash
bq --format=prettyjson ls --project_id=<exact_project>
bq --format=prettyjson ls <exact_project>:<exact_dataset>
bq --format=prettyjson show <exact_project>:<exact_dataset>.<exact_table>
bq query --use_legacy_sql=false --dry_run '<aggregate_query>'
bq query --use_legacy_sql=false --maximum_bytes_billed=<approved_byte_limit> --max_rows=20 '<aggregate_query>'
```

Use a dry run before each new BigQuery profiling query. Set `--maximum_bytes_billed` to a limit already approved by the user or repository policy; if no limit is available, get approval before running a potentially billable query. Do not change the active GCP project or billing project.

### Map native field types explicitly

When using a direct warehouse CLI, map native types to the bundled model-as-code types rather than copying warehouse type names:

| Native family | Lightdash type |
|---|---|
| Integer, numeric, decimal, floating point | `number` |
| Character/string | `string` |
| Boolean | `boolean` |
| Date | `date` |
| Timestamp/datetime | `timestamp` |

For arrays, records, variants, geography, binary values, and other unsupported or ambiguous types, omit the field from the initial model unless an explicit, safe SQL scalar conversion is required and verified. Preserve the exact source relation and column casing in `sql_from` and dimension SQL.

Shortlist fields by role:

- Candidate primary or entity keys: stable identifier-like columns, to be proven unique or many-to-one.
- Trusted dates: typed date/timestamp fields whose range and null rate fit the table's apparent grain.
- Measures: numeric fields with a documented or evidenced aggregation meaning.
- Categories: low-cardinality, non-sensitive string or boolean fields whose exact values are profiled.
- Sensitive or direct identifiers: names, emails, phone numbers, addresses, tokens, IPs, free text, account numbers, and person/device/session identifiers.

Name-based classification is only a safety screen, not proof of semantics.

For every shortlisted table, state the evidenced row grain (the entity or event represented by one row) and any related entities represented by foreign keys. If the grain or entity meaning is ambiguous, do not build measures or joins on that table yet.

## 5. Profile with aggregate-only queries

Never profile every table or every field. Profile only the shortlisted production-facing relations and only the fields needed to establish grain, keys, dates, measures, categories, and joins for the initial models.

Before each profiling query:

1. Inspect available table metadata for estimated rows/bytes and partition columns without scanning data.
2. Combine related aggregates for a small set of relevant fields instead of issuing one query per field.
3. Use a recent partition or other representative bounded predicate for initial distribution checks when that does not need to prove a whole-table invariant.
4. Use warehouse planning/cost controls before execution. BigQuery requires a dry run and an approved `--maximum_bytes_billed` value.
5. Run an exact full-table uniqueness or join-cardinality scan only for a final model candidate, and only when metadata or the estimated cost shows it is acceptable. Otherwise use a documented constraint or omit the unproven primary key/join.

Execute only aggregate queries through the chosen connection path: `lightdash sql`, `snow sql`/SnowSQL, or `bq query`. Do not use `SELECT *`, row samples, or ungrouped identifier output. Save results to a temporary location when needed, inspect only the aggregates required, and delete the files afterward.

### Use names and types to prioritize fields

Use column names and catalog types to decide which fields are worth profiling. These are query-planning assumptions only; profiling or supplied documentation must confirm the resulting semantics.

For each shortlisted table, initially select:

- One strongest key candidate: `id`, `<singular_table_name>_id`, or a warehouse key such as `*_key`. Prefer a field whose name matches the apparent row entity.
- One strongest business-event date: names such as `order_date`, `event_at`, `occurred_at`, or `created_at`. Prefer an event date over audit fields such as `updated_at`, `loaded_at`, or `synced_at`.
- Up to three plausible measures: numeric fields containing names such as `amount`, `revenue`, `cost`, `price`, `quantity`, `duration`, or `count`. Exclude numeric identifiers, codes, postal codes, year/month numbers, and sort positions.
- Up to three plausible categories: string or boolean fields containing names such as `status`, `type`, `category`, `segment`, `channel`, `region`, or an `is_*`/`has_*` flag.
- Join candidates only where an apparent foreign key such as `customer_id` or `product_key` matches the strongest key of another shortlisted model.

Skip free-text and likely sensitive fields by name, including `name`, `email`, `phone`, `address`, `description`, `comment`, `token`, `secret`, `url`, and `ip`, unless the user explicitly establishes a safe analytical need. Do not initially profile other fields. If the strongest candidates fail, widen the shortlist by one field at a time instead of querying every remaining column.

### Grain and candidate keys

```sql
SELECT
  COUNT(*) AS row_count,
  COUNT(<candidate_key>) AS non_null_key_count,
  COUNT(DISTINCT <candidate_key>) AS distinct_key_count
FROM <qualified_table>
```

This exact query can scan the full table. Run it only after the cost gate above. A single-column primary key is supported only when all three counts are equal across the whole relation. For a composite candidate, profile the warehouse-appropriate collision-safe expression and confirm the component columns are non-null. Do not concatenate without a delimiter/null strategy. A bounded or approximate result can shortlist a candidate but cannot prove a global primary key. If uniqueness is not proven, do not declare `primary_key`.

### Trusted dates and measures

```sql
SELECT
  COUNT(*) AS row_count,
  COUNT(<date_column>) AS non_null_date_count,
  MIN(<date_column>) AS min_date,
  MAX(<date_column>) AS max_date,
  COUNT(<measure_column>) AS non_null_measure_count,
  MIN(<measure_column>) AS min_measure,
  MAX(<measure_column>) AS max_measure,
  SUM(<measure_column>) AS total_measure
FROM <qualified_table>
```

Only define a sum when the field is additive at the proven grain. For balances, ratios, prices, percentages, and pre-aggregated values, prefer an evidenced aggregation such as average/min/max or omit the metric. A numeric warehouse type does not prove that a field is a measure.

### Safe categorical values

Run this only for a field already classified as non-sensitive and categorical. On a large partitioned table, start with an appropriate bounded partition and treat the result as observed values, not an exhaustive allowed-value list:

```sql
SELECT <category_column> AS category_value, COUNT(*) AS row_count
FROM <qualified_table>
WHERE <category_column> IS NOT NULL
GROUP BY <category_column>
ORDER BY row_count DESC
LIMIT 20
```

Use the exact returned values for labels or color mappings without claiming the result is exhaustive. If cardinality is unexpectedly high, values look identifying, or the field contains free text, stop reading values and omit it from the initial model. Never invent categories or normalize their casing without explicit evidence.

### Join cardinality

First prove uniqueness/null rates on each side. Then use an aggregate join check that returns counts only:

```sql
SELECT
  COUNT(*) AS base_rows,
  COUNT(joined.<joined_key>) AS matched_rows,
  COUNT(*) - COUNT(joined.<joined_key>) AS unmatched_rows
FROM <base_table> AS base
LEFT JOIN <joined_table> AS joined
  ON base.<base_key> = joined.<joined_key>
```

Declare `many-to-one` only when the joined key is unique and each base row can match at most one joined row. Apply the equivalent proof for other relationships. Omit uncertain joins; never default to `many-to-many` merely because uniqueness was not checked.

### Representative warehouse quoting

Use the exact identifiers returned by the catalog and the adapter's quoting rules:

| Warehouse | Qualified relation example |
|---|---|
| Postgres/Redshift | `"analytics"."orders"` (schema and table; the selected database is already connected) |
| Snowflake | `"ANALYTICS"."PUBLIC"."ORDERS"` |
| BigQuery | `` `acme-prod.analytics.orders` `` |
| Databricks | `` `main`.`analytics`.`orders` `` |

Do not copy an example's casing into a real project. Catalog identifiers are exact and may require quoting.

## 6. Write additive model YAML

Use stable filenames such as `lightdash/models/orders.yml`. On reruns, merge into the existing model by name: update evidenced definitions, add missing definitions, and never duplicate a dimension, metric, join, or model. Preserve unrelated fields and files.

For every included model:

- Set `type`, unique `name`, exact `sql_from`, factual `label`/`description`, and explicit `dimensions`.
- Set `primary_key` only after the aggregate uniqueness check.
- Give every dimension an explicit Lightdash `type`, `sql`, and factual `description`.
- Hide direct identifiers by default. They may support a primary key or join but must not appear in default drill fields.
- Define only evidenced metrics. Add descriptions and appropriate `format`/`round` settings when the unit is known.
- Add a trusted `default_time_dimension` when one exists.
- Set `default_show_underlying_values` only to reviewed non-sensitive fields. Omit it if no safe set exists.
- Add exact categorical color mappings only for verified values and only when useful.
- Add joins with explicit `relationship`, `description`, and preferably a limited `fields` list.

The following fixtures illustrate valid model structure. Their facts and categorical values are stated assumptions for the example only; profile the real warehouse before using any of them.

### Postgres example

Assumed evidence: `order_id` is unique/non-null, `order_date` is trusted, `status` contains exactly `completed` and `returned`, and `amount` is additive USD at order grain.

```yaml
default_show_underlying_values:
  - order_date
  - status
  - amount
default_time_dimension:
  field: order_date
  interval: DAY
description: One row per order in the analytics schema
dimensions:
  - description: Warehouse key for an order
    hidden: true
    name: order_id
    sql: ${TABLE}.order_id
    type: number
  - description: Date the order was recorded
    name: order_date
    sql: ${TABLE}.order_date
    time_intervals:
      - DAY
      - MONTH
      - YEAR
    type: date
  - colors:
      completed: "#22c55e"
      returned: "#ef4444"
    description: Verified warehouse order status
    name: status
    sql: ${TABLE}.status
    type: string
  - description: Order amount in USD
    format: usd
    name: amount
    round: 2
    sql: ${TABLE}.amount
    type: number
label: Orders
metrics:
  order_count:
    description: Distinct count of orders
    sql: ${order_id}
    type: count_distinct
  total_amount:
    description: Sum of order amounts in USD
    format: usd
    round: 2
    sql: ${amount}
    type: sum
name: orders
primary_key: order_id
sql_from: '"analytics"."orders"'
type: model
```

### Snowflake example

Assumed evidence: `PAYMENT_ID` is unique/non-null, `PAID_AT` is trusted, and `AMOUNT` is additive USD at payment grain.

```yaml
default_show_underlying_values:
  - paid_at
  - amount
default_time_dimension:
  field: paid_at
  interval: DAY
description: One row per recorded payment
dimensions:
  - description: Warehouse key for a payment
    hidden: true
    name: payment_id
    sql: ${TABLE}.PAYMENT_ID
    type: string
  - description: Timestamp when the payment was recorded
    name: paid_at
    sql: ${TABLE}.PAID_AT
    time_intervals:
      - DAY
      - MONTH
      - YEAR
    type: timestamp
  - description: Payment amount in USD
    format: usd
    name: amount
    round: 2
    sql: ${TABLE}.AMOUNT
    type: number
label: Payments
metrics:
  payment_count:
    description: Distinct count of payments
    sql: ${payment_id}
    type: count_distinct
  total_amount:
    description: Sum of payment amounts in USD
    format: usd
    round: 2
    sql: ${amount}
    type: sum
name: payments
primary_key: payment_id
sql_from: '"ANALYTICS"."PUBLIC"."PAYMENTS"'
type: model
```

### BigQuery example

Assumed evidence: `event_key` is unique/non-null, `occurred_at` is trusted, and `event_type` contains exactly `opened` and `resolved`. The direct `actor_id` is retained only as a hidden entity key.

```yaml
default_show_underlying_values:
  - occurred_at
  - event_type
default_time_dimension:
  field: occurred_at
  interval: DAY
description: One row per support event
dimensions:
  - description: Warehouse key for an event
    hidden: true
    name: event_key
    sql: ${TABLE}.event_key
    type: string
  - description: Direct actor identifier used for entity analysis
    hidden: true
    name: actor_id
    sql: ${TABLE}.actor_id
    type: string
  - description: Timestamp when the event occurred
    name: occurred_at
    sql: ${TABLE}.occurred_at
    time_intervals:
      - DAY
      - MONTH
      - YEAR
    type: timestamp
  - colors:
      opened: "#3b82f6"
      resolved: "#22c55e"
    description: Verified warehouse event type
    name: event_type
    sql: ${TABLE}.event_type
    type: string
label: Support events
metrics:
  actor_count:
    description: Distinct count of actors with support events
    sql: ${actor_id}
    type: count_distinct
  event_count:
    description: Distinct count of support events
    sql: ${event_key}
    type: count_distinct
name: support_events
primary_key: event_key
sql_from: '`acme-prod.analytics.support_events`'
type: model
```

## 7. Compile, deploy, and verify the pinned UUID

Review the diff first and confirm only intended config/model files changed. Run local schema validation, then compile without local warehouse credentials because pure Lightdash dimensions already carry explicit types.

```bash
git diff -- lightdash.config.yml lightdash/
lightdash lint --path ./lightdash
lightdash compile --project-dir . --no-warehouse-credentials
lightdash config set-project --uuid <EXPECTED_PROJECT_UUID>
lightdash config get-project
lightdash deploy --project <EXPECTED_PROJECT_UUID> --project-dir . --no-warehouse-credentials --assume-yes
lightdash validate --project <EXPECTED_PROJECT_UUID> --project-dir .
lightdash config get-project
```

Immediately before deploy, the selected UUID must equal `EXPECTED_PROJECT_UUID`. Validate that same UUID after deploy. Do not deploy if it differs.

Verify the deployed explores with focused aggregate checks. Confirm that fields compile, metrics return plausible results, joins do not fan out the base metric, identifiers remain hidden, and default drill fields contain no sensitive identifiers.

## 8. Idempotency and completion

Before finishing or rerunning:

- Confirm one file and one model definition per model name.
- Confirm dimension, metric, and join names are unique within each model.
- Confirm every semantic claim is backed by catalog metadata, aggregate evidence, or supplied documentation.
- Confirm no catalog/SQL result files, credentials, or secrets were added to git.
- Confirm unrelated repository files are unchanged.
- Record the exact project UUID verified, model files changed, checks run, and any omitted semantics that still need business confirmation.

A rerun with unchanged evidence should produce no YAML diff.
