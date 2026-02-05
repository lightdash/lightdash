---
name: developing-in-lightdash
description: Build, configure, and deploy Lightdash analytics projects. Supports both dbt projects with embedded Lightdash metadata and pure Lightdash YAML projects without dbt. Create metrics, dimensions, charts, and dashboards using the Lightdash CLI.
---

# Developing in Lightdash

Build and deploy Lightdash analytics projects. This skill covers the **semantic layer** (metrics, dimensions, joins) and **content** (charts, dashboards).

## What You Can Do

| Task | Commands | References |
|------|----------|------------|
| Explore data warehouse | `lightdash sql` to execute raw sql, read .csv results | [CLI Reference](./resources/cli-reference.md) |
| Define metrics & dimensions | Edit dbt YAML or Lightdash YAML | [Metrics](./resources/metrics-reference.md), [Dimensions](./resources/dimensions-reference.md) |
| Create charts | `lightdash download`, edit YAML, `lightdash upload` | [Chart Types](#chart-types) |
| Build dashboards | `lightdash download`, edit YAML, `lightdash upload` | [Dashboard Reference](./resources/dashboard-reference.md) |
| Lint yaml files | `lightdash lint` | [CLI Reference](./resources/cli-reference.md) |
| Deploy changes | `lightdash deploy` (semantic layer), `lightdash upload` (content) | [CLI Reference](./resources/cli-reference.md) |
| Test changes | `lightdash preview` | [Workflows](./resources/workflows-reference.md) |

## Before You Start

### Check Your Target Project

**Always verify which project you're deploying to.** Deploying to the wrong project can overwrite production content.

```bash
# Check current project
lightdash config get-project

# List available projects
lightdash config list-projects

# Switch to correct project
lightdash config set-project --name "My Project"
```

### Detect Your Project Type

**The YAML syntax differs significantly between project types.**

| Type | Detection | Key Difference |
|------|-----------|----------------|
| **dbt Project** | Has `dbt_project.yml` | Metadata nested under `meta:` |
| **Pure Lightdash** | Has `lightdash.config.yml`, no dbt | Top-level properties |

```bash
# Quick detection
ls dbt_project.yml 2>/dev/null && echo "dbt project" || echo "Not dbt"
ls lightdash.config.yml 2>/dev/null && echo "Pure Lightdash" || echo "Not pure Lightdash"
```

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

## Core Workflows

### Editing Metrics & Dimensions

1. **Find the model YAML file** (dbt: `models/*.yml`, pure Lightdash: `lightdash/models/*.yml`)
2. **Edit metrics/dimensions** using the appropriate syntax for your project type
3. **Validate**: `lightdash lint` (pure Lightdash) or `dbt compile` (dbt projects)
4. **Deploy**: `lightdash deploy`

See [Metrics Reference](./resources/metrics-reference.md) and [Dimensions Reference](./resources/dimensions-reference.md) for configuration options.

### Editing Charts

1. **Download**: `lightdash download --charts chart-slug`
2. **Edit** the YAML file in `lightdash/` directory
3. **Upload**: `lightdash upload --charts chart-slug`

### Editing Dashboards

1. **Download**: `lightdash download --dashboards dashboard-slug`
2. **Edit** the YAML file in `lightdash/` directory
3. **Upload**: `lightdash upload --dashboards dashboard-slug`

### Creating New Content

Charts and dashboards are typically created in the UI first, then managed as code:

1. Create in UI
2. `lightdash download` to pull as YAML
3. Edit and version control
4. `lightdash upload` to sync changes

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

See [CLI Reference](./resources/cli-reference.md) for full command documentation.

## Semantic Layer Overview

The semantic layer defines your data model: what can be queried and how.

### Tables (Explores)

Tables are dbt models or Lightdash YAML models that define queryable entities.

```yaml
# dbt example
models:
  - name: orders
    meta:
      label: "Orders"
      joins:
        - join: customers
          sql_on: "${orders.customer_id} = ${customers.customer_id}"
```

See [Tables Reference](./resources/tables-reference.md) for all options.

### Metrics

Aggregated calculations (sum, count, average, etc.) on your data.

```yaml
metrics:
  total_revenue:
    type: sum
    sql: "${TABLE}.amount"
    format: "usd"
```

**Common types:** `count`, `count_distinct`, `sum`, `average`, `min`, `max`, `number` (custom SQL)

See [Metrics Reference](./resources/metrics-reference.md) for all types and options.

### Dimensions

Attributes for grouping and filtering data.

```yaml
columns:
  - name: created_at
    meta:
      dimension:
        type: timestamp
        time_intervals: [DAY, WEEK, MONTH, YEAR]
```

**Types:** `string`, `number`, `boolean`, `date`, `timestamp`

See [Dimensions Reference](./resources/dimensions-reference.md) for all options including time intervals.

### Joins

Connect related tables for cross-table analysis.

```yaml
joins:
  - join: customers
    sql_on: "${orders.customer_id} = ${customers.customer_id}"
    type: left
```

See [Joins Reference](./resources/joins-reference.md) for configuration options.

## Chart Types

Lightdash supports 9 chart types. Each has a dedicated reference:

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
| `custom` | Vega-Lite | [Custom Viz](./resources/custom-viz-reference.md) |

See individual chart type references for YAML structure and configuration options.

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
- [Custom Viz Reference](./resources/custom-viz-reference.md)

### Dashboards & Workflows
- [Dashboard Reference](./resources/dashboard-reference.md)
- [Dashboard Best Practices](./resources/dashboard-best-practices.md)
- [CLI Reference](./resources/cli-reference.md)
- [Workflows Reference](./resources/workflows-reference.md)

### External
- [Lightdash Docs](https://docs.lightdash.com)
