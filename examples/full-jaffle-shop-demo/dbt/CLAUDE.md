# Jaffle Shop Demo - dbt Project

This is the dbt project used for testing Lightdash functionality, based on the classic "jaffle shop" demo data with additional models for comprehensive testing.

## Project Structure

### Data Sources

All raw data comes from CSV files in the `data/` directory:

-   `raw_customers.csv` - Customer information
-   `raw_orders.csv` - Order transactions
-   `raw_payments.csv` - Payment records
-   `raw_subscriptions.csv` - Subscription data (1000 records)
-   `raw_plan.csv` - Subscription plan definitions

**Important**: When adding new data files, use `git add -f <filename>` since these files are typically gitignored.

### Models

Each model follows dbt best practices:

-   `.sql` file contains the model logic (SELECT statements with CTEs)
-   `.yml` file contains schema definitions, tests, and Lightdash metadata

Key models:

-   `customers.sql/.yml` - Customer dimension with lifetime metrics
-   `orders.sql/.yml` - Order fact table with order-level calculations
-   `subscriptions.sql/.yml` - Subscription model with realistic SaaS metrics and parameters
-   `plan.sql/.yml` - Plan dimension for subscription tiers

### Lightdash Integration

-   `lightdash.config.yml` - Global parameters and spotlight categories
-   Model YML files contain Lightdash metadata under `config.meta`
-   Dimensions, metrics, and joins are defined in the YML schema files

## Development Notes

### Data Generation

-   Subscription data uses weighted distribution (40% free, 37% silver, 14% gold, 8% platinum, 2% diamond)
-   Realistic duration patterns with varied subscription lengths
-   MRR calculations based on plan tiers

### Model Patterns

-   Use CTEs (`with` statements) for readable SQL
-   Proper table aliasing when joining multiple sources
-   Include both raw dimensions and calculated fields
-   Add comprehensive descriptions for business users

### Testing

-   Unique and not_null tests on primary keys
-   Custom tests for business logic validation
-   Relationships tests between fact and dimension tables

## Common Commands

```bash
# Run all models
dbt run --profiles-dir ../profiles/

# Run specific model
dbt run --select subscriptions --profiles-dir ../profiles/

# Compile to see generated SQL
dbt compile --select subscriptions --profiles-dir ../profiles/

# Run tests
dbt test --profiles-dir ../profiles/
```

## Cross-Warehouse Compatibility

This project supports multiple warehouses (PostgreSQL, Snowflake, BigQuery, Trino, Athena, etc.) using Jinja macros for SQL dialect differences.

### Macros (`macros/casts.sql`)

Type casting macros that handle PostgreSQL `::type` syntax vs other warehouses:

| Macro                 | PostgreSQL       | Athena/Trino             | Notes                       |
| --------------------- | ---------------- | ------------------------ | --------------------------- |
| `cast_numeric(col)`   | `col::numeric`   | `CAST(col AS DOUBLE)`    |                             |
| `cast_float(col)`     | `col::float`     | `CAST(col AS DOUBLE)`    |                             |
| `cast_decimal(col)`   | `col::decimal`   | `CAST(col AS DOUBLE)`    |                             |
| `cast_integer(col)`   | `col::integer`   | `CAST(col AS INTEGER)`   |                             |
| `cast_boolean(col)`   | `col::boolean`   | `CAST(col AS BOOLEAN)`   |                             |
| `cast_date(col)`      | `col::date`      | `CAST(col AS DATE)`      |                             |
| `cast_timestamp(col)` | `col::timestamp` | `CAST(col AS TIMESTAMP)` |                             |
| `cast_time(col)`      | `col::time`      | `CAST(col AS VARCHAR)`   | Athena doesn't support TIME |
| `cast_json(col)`      | `col::json`      | `CAST(col AS JSON)`      |                             |

Date/time helper macros:

| Macro                         | PostgreSQL                    | Athena/Trino                           | Notes              |
| ----------------------------- | ----------------------------- | -------------------------------------- | ------------------ |
| `date_diff_days(d1, d2)`      | `d1::date - d2::date`         | `DATE_DIFF('day', d2, d1)`             | Days between dates |
| `timestamp_diff_days(t1, t2)` | `EXTRACT(day FROM t1 - t2)`   | `DATE_DIFF('day', t2, t1)`             |                    |
| `age_years(date_col)`         | `date_part('year', age(...))` | `DATE_DIFF('year', col, CURRENT_DATE)` | Age in years       |

JSON extraction:

| Macro                           | PostgreSQL          | Athena/Trino                          |
| ------------------------------- | ------------------- | ------------------------------------- |
| `json_extract_string(col, key)` | `col::json->>'key'` | `JSON_EXTRACT_SCALAR(col, '$."key"')` |

### Seed Column Types (`data/seeds.yml`)

Some seeds require explicit column types for Athena compatibility:

-   **jsonb columns**: Use `varchar` for Athena (doesn't support jsonb)
-   **time columns**: Use `varchar` for Athena (Hive metastore doesn't support TIME)
-   **numeric columns**: Use `double` to avoid INT cast errors on decimal values
-   **date columns**: Athena requires ISO format (YYYY-MM-DD), not human-readable formats

Example:

```yaml
- name: raw_product_events
  config:
      column_types:
          event_properties: >-
              {%- if target.type == 'snowflake' -%}
                variant
              {%- elif target.type == 'athena' or target.type == 'trino' -%}
                varchar
              {%- else -%}
                jsonb
              {%- endif -%}
```

### Athena-Specific Limitations

1. **No `::` cast syntax** - Use `CAST(col AS TYPE)` via macros
2. **No TIME type** - Use VARCHAR to store time strings
3. **No jsonb type** - Use VARCHAR and parse with JSON functions
4. **No `numeric` type** - Use DOUBLE or DECIMAL(p,s)
5. **No qualified columns after USING joins** - Can't use `table.col` after `JOIN ... USING (col)`, must use unqualified `col`
6. **No `DISTINCT ON`** - Use `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` in subquery with `WHERE rn = 1`
7. **No `string_agg`** - Use `array_join(array_agg(distinct col), ', ')` instead
8. **Date/time differences:**
    - **Date format** - Only accepts ISO format (YYYY-MM-DD), not "Jan 1, 2024"
    - **No `age()` function** - Use `DATE_DIFF('year', date_col, CURRENT_DATE)`
    - **No integer from date subtraction** - `end_date - start_date` returns INTERVAL. Use `DATE_DIFF('day', start_date, end_date)`
    - **No date + integer arithmetic** - `date_col + 30` doesn't work. Use `DATE_ADD('day', 30, date_col)`
    - **No implicit timestamp/varchar comparison** - Use `TIMESTAMP '2024-12-31 11:52:45'` literal
    - **Different interval syntax** - `interval '90 days'` doesn't work. Use `DATE_ADD('day', 90, date_col)`
    - **No `EXTRACT(epoch FROM ...)`** - Use `DATE_DIFF('second', start, end)` to get seconds
    - **No `to_char`** - Use `date_format(date, '%W')` for day name, `date_format(date, '%Y-%m-%d')` for formatting

## Troubleshooting

-   If Lightdash dimensions aren't appearing, check that columns exist in the compiled SQL
-   For cross-table references, ensure proper joins exist in the SQL model, not just YAML
-   Use `git add -f` for any new data files in the `data/` directory
