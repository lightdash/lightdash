---
name: developing-in-lightdash
description: Use when working with Lightdash YAML files, dbt models with Lightdash metadata, the lightdash CLI (deploy, upload, download, preview, lint, sql, set-warehouse), or creating/editing charts, dashboards, metrics, and dimensions as code
---

# Developing in Lightdash

Build and deploy Lightdash analytics projects. This skill covers the **semantic layer** (metrics, dimensions, joins) and **content** (charts, dashboards).

## When to Use

- Working with Lightdash YAML files (charts, dashboards, models as code)
- Using the `lightdash` CLI (`deploy`, `upload`, `download`, `preview`, `lint`, `sql`)
- Defining metrics, dimensions, joins, or tables in dbt or pure Lightdash projects
- Creating or editing charts and dashboards as code

**Don't use for:** Developing the Lightdash application itself (use the codebase CLAUDE.md), general dbt work without Lightdash metadata, or raw SQL unrelated to Lightdash models.

## What You Can Do

| Task | Commands | References |
|------|----------|------------|
| Explore data warehouse | `lightdash sql` to execute raw sql, read .csv results | [CLI Reference](./resources/cli-reference.md) |
| Define metrics & dimensions | Edit dbt YAML or Lightdash YAML | [Metrics](./resources/metrics-reference.md), [Dimensions](./resources/dimensions-reference.md) |
| Create charts | `lightdash download`, edit YAML, `lightdash upload` | [Chart Types](#chart-types) |
| Add period comparisons | Add PoP additional metrics to chart YAML | [Period over Period](./resources/period-over-period-reference.md) |
| Build dashboards | `lightdash download`, edit YAML, `lightdash upload` | [Dashboard Reference](./resources/dashboard-reference.md) |
| Lint yaml files | `lightdash lint` | [CLI Reference](./resources/cli-reference.md) |
| Set warehouse connection | `lightdash set-warehouse` from profiles.yml | [CLI Reference](./resources/cli-reference.md) |
| Deploy changes | `lightdash deploy` (semantic layer), `lightdash upload` (content) | [CLI Reference](./resources/cli-reference.md) |
| Test changes | `lightdash preview` | [Workflows](./resources/workflows-reference.md) |

## Common Mistakes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| **Guessing filter values** | Case mismatches (`'Payment'` vs `'payment'`) cause charts to silently return no data | Always run `lightdash sql "SELECT DISTINCT column FROM table LIMIT 50" -o values.csv` and use exact values |
| **Not updating dashboard tiles after renaming a chart** | Dashboard tile still shows old title — `title` and `chartName` are independent overrides that do NOT auto-update | Download the dashboard, find tiles with matching `chartSlug`, update `title` and `chartName` to match |
| **Including unused dimensions in metricQuery** | "Results may be incorrect" warning — extra dimensions change SQL grouping and produce wrong numbers | Every dimension in `metricQuery.dimensions` must appear in the chart config. For cartesian: `layout.xField`, `layout.yField`, or `pivotConfig.columns` |
| **Unsorted YAML keys** | `lightdash upload` warns "unsorted YAML keys" and diffs become noisy | Always sort keys alphabetically at every nesting level — the CLI writes with `sortKeys: true` |
| **Deploying to wrong project** | Overwrites production content | Always run `lightdash config get-project` before deploying |
| **Missing `contentType` field** | Content type can't be determined without relying on directory structure | Always include `contentType: chart`, `contentType: dashboard`, or `contentType: sql_chart` at the top level |

## Before You Start

### Check Your Target Project

**Always verify which project you're deploying to.** Deploying to the wrong project can overwrite production content.

```bash
lightdash config get-project        # Show current project
lightdash config list-projects      # List available projects
lightdash config set-project --name "My Project"  # Switch project
```

### Detect Your Project Type

**The YAML syntax differs significantly between project types.**

| Type | Detection | Key Difference |
|------|-----------|----------------|
| **dbt Project** | Has `dbt_project.yml` | Metadata nested under `meta:` |
| **dbt Fusion / dbt 1.10+** | Has `dbt_project.yml`, uses dbt Fusion or dbt >= 1.10 | Metadata nested under `config: meta:` |
| **Pure Lightdash** | Has `lightdash.config.yml`, no dbt | Top-level properties |

```bash
ls dbt_project.yml 2>/dev/null && echo "dbt project" || echo "Not dbt"
ls lightdash.config.yml 2>/dev/null && echo "Pure Lightdash" || echo "Not pure Lightdash"
```

> **dbt Fusion / dbt 1.10+:** Lightdash metadata must be nested under `config: meta:` instead of `meta:`. The properties are identical — only the nesting changes. Example:
> ```yaml
> models:
>   - name: orders
>     config:
>       meta:
>         metrics:
>           total_revenue:
>             type: sum
>             sql: "${TABLE}.amount"
> ```

### Syntax Comparison

**dbt YAML** (metadata under `meta:`):
```yaml
models:
  - name: orders
    meta:
      metrics:
        total_revenue:
          type: sum
          sql: "${TABLE}.amount"
    columns:
      - name: status
        meta:
          dimension:
            type: string
```

**Pure Lightdash YAML** (top-level):
```yaml
type: model
name: orders
sql_from: 'DB.SCHEMA.ORDERS'

metrics:
  total_revenue:
    type: sum
    sql: ${TABLE}.amount

dimensions:
  - name: status
    sql: ${TABLE}.STATUS
    type: string
```

## Setting Up Warehouse Connection

If the project needs a different warehouse connection (e.g., switching from Postgres to BigQuery), update it from your profiles.yml:

```bash
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles --assume-yes
```

This reads credentials from profiles.yml, updates the warehouse connection on the currently selected project, and triggers a recompile. Run this before `lightdash deploy`.

To target a specific project:

```bash
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles --project <uuid> --assume-yes
```

## Core Workflows

### Verify Filter Values Before Using Them

**CRITICAL**: Never guess filter values. Case mismatches (e.g., `'Payment'` vs `'payment'`) cause charts to silently return no data.

**Before writing any string filter**, query actual values from the warehouse:

```bash
lightdash sql "SELECT DISTINCT category FROM payments LIMIT 50" -o category_values.csv
```

Read the CSV and use the **exact values** in your filter YAML. This applies to all `equals`/`notEquals` filters with string values — in charts and dashboards.

### Editing Metrics & Dimensions

1. **Find the model YAML file** (dbt: `models/*.yml`, pure Lightdash: `lightdash/models/*.yml`)
2. **Edit metrics/dimensions** using the appropriate syntax for your project type
3. **Validate**: `lightdash lint` (pure Lightdash) or `dbt compile` (dbt projects)
4. **Deploy**: `lightdash deploy`

See [Metrics Reference](./resources/metrics-reference.md) and [Dimensions Reference](./resources/dimensions-reference.md) for configuration options.

### Editing Charts

1. **Download**: `lightdash download --charts chart-slug`
2. **Edit** the YAML file in `lightdash/` directory
3. **Verify filter values**: If you added or changed filters, use `lightdash sql` to check actual column values (see [Common Mistakes](#common-mistakes))
4. **Update dashboard tiles**: If you changed the chart's name or purpose, download any dashboards that reference it and update their tile `title` and `chartName` properties to match (see [Common Mistakes](#common-mistakes))
5. **Lint**: `lightdash lint` to validate before uploading
6. **Upload**: `lightdash upload --charts chart-slug` (and any modified dashboards)

**Dashboard tiles have their own titles.** A `saved_chart` tile's `title` and `chartName` properties are independent overrides — they do NOT auto-update when you rename the chart. If you change a chart from "Total Revenue" to "Gross Profit" but don't update the dashboard tile, the dashboard will still display "Total Revenue". Always download the dashboard, find tiles with matching `chartSlug`, and update their `title` and `chartName` to match.

```yaml
# Dashboard tile — title and chartName must be updated manually when chart changes
tiles:
  - type: saved_chart
    properties:
      chartSlug: total-revenue-kpi
      title: "Gross Profit"        # ← Update this when chart name/purpose changes
      chartName: "Gross Profit"    # ← Update this too
```

### Editing Dashboards

1. **Download**: `lightdash download --dashboards dashboard-slug`
2. **Edit** the YAML file in `lightdash/` directory
3. **Verify filter values**: If you added or changed filters, use `lightdash sql` to check actual column values (see [Common Mistakes](#common-mistakes))
4. **Lint**: `lightdash lint` to validate before uploading
5. **Upload**: `lightdash upload --dashboards dashboard-slug`

### Creating New Content

Charts and dashboards are typically created in the UI first, then managed as code:

1. Create in UI
2. `lightdash download` to pull as YAML
3. Edit and version control
4. `lightdash lint` to validate before uploading
5. `lightdash upload` to sync changes

### Testing with Preview

For larger changes, test in isolation:

```bash
lightdash preview --name "my-feature"
# Make changes and iterate
lightdash stop-preview --name "my-feature"
```

## CLI Quick Reference

| Command | Purpose |
|---------|---------|
| `lightdash deploy` | Sync semantic layer (metrics, dimensions) |
| `lightdash upload` | Upload charts/dashboards |
| `lightdash download` | Download charts/dashboards as YAML |
| `lightdash lint` | Validate YAML locally |
| `lightdash preview` | Create temporary test project |
| `lightdash sql "..." -o file.csv` | Run SQL queries against warehouse |
| `lightdash run-chart -p chart.yml` | Execute chart YAML query against warehouse |

See [CLI Reference](./resources/cli-reference.md) for full command documentation.

## Semantic Layer

The semantic layer defines your data model. See individual references for full configuration:

- [Tables Reference](./resources/tables-reference.md) — queryable entities, labels, joins
- [Metrics Reference](./resources/metrics-reference.md) — aggregated calculations (`count`, `sum`, `average`, `min`, `max`, `number`, etc.)
- [Dimensions Reference](./resources/dimensions-reference.md) — attributes for grouping/filtering (`string`, `number`, `boolean`, `date`, `timestamp`)
- [Joins Reference](./resources/joins-reference.md) — cross-table relationships

## Chart Types

All charts share a common base structure:

```yaml
chartConfig:
  config: {}        # Type-specific — see individual references
  type: <type>
contentType: chart              # Required: chart, dashboard, or sql_chart
dashboardSlug: my-dashboard  # Optional: scopes chart to dashboard (won't appear in space)
metricQuery:
  dimensions:
    - my_explore_category
  exploreName: my_explore     # Required: which explore to query
  filters: {}
  limit: 500
  metrics:
    - my_explore_total_sales
  sorts: []
name: "Chart Name"
slug: unique-chart-slug
spaceSlug: target-space
tableConfig:
  columnOrder: []
tableName: my_explore           # Required: top-level explore/table name
version: 1
```

**Key ordering:** All YAML keys must be sorted alphabetically at every nesting level. The CLI writes files with `sortKeys: true` and warns on upload if keys are unsorted. When writing or editing YAML by hand, keep keys in alphabetical order to avoid warnings and noisy diffs.

**Chart scoping:** Use `spaceSlug` only for shared charts. Add `dashboardSlug` to scope a chart to a specific dashboard (it won't appear in the space).

### Choosing the Right Chart Type

| Data Pattern | Recommended Chart | Why |
|--------------|-------------------|-----|
| Trends over time | Line or area (`cartesian`) | Shows continuous change with time on X-axis |
| Category comparisons | Bar (`cartesian`) | Easy visual comparison between discrete categories |
| Part-of-whole relationships | `pie` or `treemap` | Shows proportions summing to 100% |
| Single KPI metric | `big_number` | Focuses attention on one important value |
| Conversion stages | `funnel` | Visualizes drop-off between sequential steps |
| Progress toward target | `gauge` | Shows current value relative to goal |
| Geographic data | `map` | Plots data points or regions on a map |
| Flow between categories | `sankey` | Shows how values move from source to target nodes |
| Detailed records | `table` | Displays raw data with sorting and formatting |
| Advanced custom needs | `custom` | Full Vega-Lite spec for custom visualizations |

| Type | Use Case | Reference |
|------|----------|-----------|
| `cartesian` | Bar, line, area, scatter | [Cartesian](./resources/cartesian-chart-reference.md) |
| `pie` | Parts of whole | [Pie](./resources/pie-chart-reference.md) |
| `table` | Data tables | [Table](./resources/table-chart-reference.md) |
| `big_number` | KPIs | [Big Number](./resources/big-number-chart-reference.md) |
| `funnel` | Conversion funnels | [Funnel](./resources/funnel-chart-reference.md) |
| `gauge` | Progress indicators | [Gauge](./resources/gauge-chart-reference.md) |
| `treemap` | Hierarchical data | [Treemap](./resources/treemap-chart-reference.md) |
| `map` | Geographic data | [Map](./resources/map-chart-reference.md) |
| `sankey` | Flow diagrams | [Sankey](./resources/sankey-chart-reference.md) |
| `custom` | Vega-Lite | [Custom Viz](./resources/custom-viz-reference.md) |

## Dashboards

Dashboards arrange charts and content in a grid layout. See [Dashboard Reference](./resources/dashboard-reference.md) for YAML structure, tile types, tabs, and filters.

## Exploring the Warehouse

Use `lightdash sql` to explore data when building models:

```bash
# Preview table structure
lightdash sql "SELECT * FROM orders LIMIT 5" -o preview.csv

# Check distinct values for a dimension
lightdash sql "SELECT DISTINCT status FROM orders" -o statuses.csv

# Test metric calculations
lightdash sql "SELECT SUM(amount) FROM orders" -o test.csv
```

## Workflow Patterns

| Pattern | When to Use |
|---------|-------------|
| **Direct** (`deploy` + `upload`) | Solo dev, rapid iteration |
| **Preview-First** | Team, complex changes |
| **CI/CD** | Automated on merge |

See [Workflows Reference](./resources/workflows-reference.md) for detailed examples and CI/CD configurations.

## Resources

### Semantic Layer
- [Dimensions Reference](./resources/dimensions-reference.md)
- [Metrics Reference](./resources/metrics-reference.md)
- [Tables Reference](./resources/tables-reference.md)
- [Joins Reference](./resources/joins-reference.md)

### Charts
- [Cartesian Chart Reference](./resources/cartesian-chart-reference.md) - Bar, line, area, scatter
- [Pie Chart Reference](./resources/pie-chart-reference.md)
- [Table Chart Reference](./resources/table-chart-reference.md)
- [Big Number Reference](./resources/big-number-chart-reference.md)
- [Funnel Chart Reference](./resources/funnel-chart-reference.md)
- [Gauge Chart Reference](./resources/gauge-chart-reference.md)
- [Treemap Chart Reference](./resources/treemap-chart-reference.md)
- [Map Chart Reference](./resources/map-chart-reference.md)
- [Sankey Chart Reference](./resources/sankey-chart-reference.md)
- [Custom Viz Reference](./resources/custom-viz-reference.md)
- [Period over Period Reference](./resources/period-over-period-reference.md) - PoP comparisons (YoY, MoM, etc.)

### Dashboards & Workflows
- [Dashboard Reference](./resources/dashboard-reference.md)
- [Dashboard Best Practices](./resources/dashboard-best-practices.md)
- [CLI Reference](./resources/cli-reference.md)
- [Workflows Reference](./resources/workflows-reference.md)

### External
- [Lightdash Docs](https://docs.lightdash.com)
