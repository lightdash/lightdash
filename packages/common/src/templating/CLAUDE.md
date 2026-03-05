<summary>
Templating engines for Lightdash. Two separate engines: `template.ts` for URL/label templates using custom `${}` delimiters, and `liquidSql.ts` for conditional SQL using standard Liquid `{% %}` delimiters with Lightdash parameters.
</summary>

# Liquid SQL Templating (`liquidSql.ts`)

## What It Does

Evaluates Liquid template blocks in dimension/metric SQL at **query time**, enabling parameter-driven conditional SQL. This supports Looker migration patterns where dimensions switch between SQL expressions based on parameter values.

## Syntax

Use `{% %}` Liquid tags with `ld.parameters.<name>` or `lightdash.parameters.<name>`.

**Important**: Liquid blocks must be wrapped in `{% raw %}...{% endraw %}` in dbt YAML files so dbt's Jinja engine passes them through without trying to parse them. dbt processes `{% raw %}` and strips the wrapper, leaving clean Liquid syntax in the manifest for Lightdash to evaluate at query time.

### if/elsif/else (most common)

```yaml
dimension:
  type: string
  sql: >
    {% raw %}{% if ld.parameters.date_granularity == 'Day' %} ${TABLE}.date
    {% elsif ld.parameters.date_granularity == 'Week' %} DATE_TRUNC('week', ${TABLE}.date)
    {% elsif ld.parameters.date_granularity == 'Month' %} DATE_TRUNC('month', ${TABLE}.date)
    {% else %} ${TABLE}.date
    {% endif %}{% endraw %}
```

### case/when (cleaner for many values)

```yaml
dimension:
  type: string
  sql: >
    {% raw %}{% case ld.parameters.date_granularity %}
    {% when 'Day' %} ${TABLE}.date
    {% when 'Week' %} DATE_TRUNC('week', ${TABLE}.date)
    {% when 'Month' %} DATE_TRUNC('month', ${TABLE}.date)
    {% else %} ${TABLE}.date
    {% endcase %}{% endraw %}
```

### Column switching (metrics)

```yaml
dimension:
  hidden: true
  type: number
  sql: >
    {% raw %}{% if ld.parameters.metric_type == 'count' %} 1
    {% else %} ${TABLE}.event_id
    {% endif %}{% endraw %}
metrics:
  dynamic_total:
    type: sum
```

## Why `{% raw %}` Is Needed

dbt uses Jinja, which also uses `{% %}` delimiters. When dbt encounters `{% if %}` blocks, it tries to parse them as Jinja. Lightdash uses `{% elsif %}` (Liquid syntax), but Jinja expects `{% elif %}`, causing a compilation error.

Wrapping in `{% raw %}...{% endraw %}` tells dbt's Jinja engine to pass the content through untouched. After dbt processes `{% raw %}`, the manifest contains the clean Liquid syntax for Lightdash to evaluate at query time.

## How It Works — Query-Time Rendering

When a query runs:

1. `safeReplaceParametersWithTypes()` in `QueryBuilder/parameters.ts` calls `renderLiquidSql(sql, parameterValues)`
2. `renderLiquidSql` checks for `{%` — if absent, returns SQL unchanged (zero overhead)
3. If present, builds a Liquid context with `ld.parameters` and `lightdash.parameters` namespaces
4. LiquidJS evaluates the template, resolving if/case/for blocks based on parameter values
5. The resulting SQL then goes through normal `${ld.parameters.x}` substitution

### Parameter Detection for UI

`getParameterReferencesFromSqlAndFormat()` in `compiler/parameters.ts` extracts parameter names from both `${ld.parameters.x}` syntax and `{% if ld.parameters.x %}` syntax, so the UI shows the parameter selector.

## Safety Mechanisms

- **Try/catch in `renderLiquidSql`**: If Liquid parsing fails, falls back to original SQL
- **Fast `{%` check**: Skips all Liquid processing for SQL that doesn't contain `{%` (zero overhead for existing queries)
- **`strictVariables: false`**: Missing parameters resolve to falsy instead of throwing

## Key Files

- `liquidSql.ts` — Core engine: `renderLiquidSql()`, `buildLiquidContext()`
- `liquidSql.test.ts` — Tests for rendering and context building
- `@/packages/backend/src/utils/QueryBuilder/parameters.ts` — Query-time integration
- `@/packages/common/src/compiler/parameters.ts` — Parameter reference extraction

## Supported Liquid Syntax

LiquidJS supports the full Liquid spec. The engine already handles any valid Liquid syntax at query time. Currently tested:

- `{% if %}` / `{% elsif %}` / `{% else %}` / `{% endif %}`
- `{% case %}` / `{% when %}` / `{% else %}` / `{% endcase %}`

Other Liquid features (e.g., `{% for %}`, `{% unless %}`, `{% assign %}`, filters) work at query time automatically. No code changes needed — just wrap in `{% raw %}` in the YAML.

## Relationship to Other Templating

- **`template.ts`** — URL/label templates using `${}` delimiters for row value interpolation. Completely separate from Liquid SQL.
- **`${ld.parameters.x}`** — Regex-based parameter substitution (existing system). Liquid blocks are evaluated **before** this substitution, so both can coexist in the same SQL.
- **User attributes** — `${ld.attribute.x}` uses regex substitution, not Liquid. Separate system.
