---
name: developing-in-lightdash
description: Build, configure, and deploy Lightdash analytics projects. Create dbt models with metrics and dimensions, design charts and dashboards, and manage deployments using the Lightdash CLI.
---

# Developing in Lightdash

Build, configure, and deploy Lightdash analytics projects. Create dbt models with metrics and dimensions, design beautiful charts and dashboards, and manage deployments using the Lightdash CLI.

## Capabilities

This skill enables you to:

- **dbt Model Development**: Create and update dbt models with Lightdash metadata (dimensions, metrics, joins)
- **Chart Creation**: Build and customize all chart types (bar, line, pie, funnel, table, big number, etc.)
- **Dashboard Design**: Create multi-tile dashboards with filters, tabs, and interactive elements
- **CLI Operations**: Deploy, preview, validate, and manage Lightdash projects

## Workflow Components

| Command | What It Does |
|---------|--------------|
| `lightdash deploy` | Compiles dbt models and syncs schema to Lightdash |
| `lightdash upload` | Uploads chart/dashboard YAML files to Lightdash |
| `lightdash download` | Downloads charts/dashboards as YAML files |
| `lightdash preview` | Creates a temporary project for testing |
| `lightdash validate` | Validates project against Lightdash server |
| `lightdash lint` | Validates YAML files locally (offline) |

### Key Concepts

**dbt Target**: `lightdash deploy` uses `--target` to determine which warehouse schemas to use. Check with `dbt debug` before deploying.

**Credentials**: Only `deploy --create` uploads credentials from dbt profiles. Deploying to existing projects does NOT update credentials. In CI (`CI=true`), permission prompts are auto-approved.

**Preview**: `lightdash preview` creates a temporary, isolated project using your current dbt target's schemas.

## Common Workflow Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| **Direct Deployment** | `deploy` + `upload` straight to project | Solo dev, rapid iteration |
| **Preview-First** | Test in `preview`, then deploy to main | Team, complex changes |
| **CI/CD Pipeline** | Automated deploy on merge to main | PRs, reproducible deploys |
| **PR Previews** | Create preview per pull request | Review workflows |
| **Download-Edit-Upload** | Pull UI content into code | Migrating to GitOps |
| **Multi-Environment** | Separate dev/staging/prod projects | Formal promotion process |

### Detecting Your Workflow

| Clue in Repository | Likely Pattern |
|--------------------|----------------|
| `.github/workflows/` with Lightdash steps | CI/CD Pipeline |
| `lightdash/` directory with YAML files | Code-based content |
| Multiple projects configured | Multi-Environment |
| No CI, small team | Direct Deployment |

See [Workflows Reference](./resources/workflows-reference.md) for detailed examples and CI/CD configurations.

### Exploring the Warehouse with SQL

When creating or editing dbt models and YAML files, use `lightdash sql` to explore the warehouse directly. This is invaluable for:

- **Discovering available columns**: Query `INFORMATION_SCHEMA` or run `SELECT *` with a limit to see what data exists
- **Testing SQL snippets**: Validate custom SQL for metrics or dimensions before adding to YAML
- **Verifying data types**: Check column types to choose the right dimension/metric configurations
- **Exploring relationships**: Investigate foreign keys and join conditions between tables

**Example exploration workflow:**

```bash
# See what tables exist (PostgreSQL/Redshift)
lightdash sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" -o tables.csv

# Explore columns in a table (PostgreSQL/Redshift)
lightdash sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders'" -o columns.csv

# Preview data to understand the schema
lightdash sql "SELECT * FROM orders LIMIT 5" -o preview.csv

# Test a metric calculation before adding to YAML
lightdash sql "SELECT customer_id, SUM(amount) as total_spent FROM orders GROUP BY 1 LIMIT 10" -o test.csv

# Check distinct values for a potential dimension
lightdash sql "SELECT DISTINCT status FROM orders" -o statuses.csv
```

**Tip:** The SQL runner uses credentials from your current Lightdash project, so you're querying the same warehouse that Lightdash uses. This ensures your explorations match what will work in production.

## Quick Reference

### dbt YAML Structure

```yaml
version: 2

models:
  - name: orders
    description: "Order transactions"
    meta:
      label: "Orders"
      order_fields_by: "label"  # or "index"
      group_label: "Sales"

      # Joins to other models
      joins:
        - join: customers
          sql_on: "${orders.customer_id} = ${customers.customer_id}"
          type: left  # inner, left, right, full

      # Model-level metrics
      metrics:
        total_revenue:
          type: sum
          sql: "${TABLE}.amount"
          description: "Total order revenue"
          format: "usd"

    columns:
      - name: order_id
        description: "Primary key"
        meta:
          dimension:
            type: string
            hidden: false

      - name: amount
        description: "Order amount in USD"
        meta:
          dimension:
            type: number
            format: "usd"
          metrics:
            total_amount:
              type: sum
            average_amount:
              type: average
              round: 2

      - name: created_at
        description: "Order timestamp"
        meta:
          dimension:
            type: timestamp
            time_intervals:
              - DAY
              - WEEK
              - MONTH
              - YEAR
```

### Metric Types

| Type | Description | Example |
|------|-------------|---------|
| `count` | Count all rows | Total orders |
| `count_distinct` | Count unique values | Unique customers |
| `sum` | Sum numeric values | Total revenue |
| `average` | Average of values | Avg order value |
| `min` | Minimum value | First order date |
| `max` | Maximum value | Largest order |
| `percentile` | Percentile (requires `percentile: 95`) | P95 response time |
| `median` | Median value | Median order value |
| `number` | Custom SQL returning number | `sql: "SUM(${amount}) / COUNT(*)"` |

### Dimension Types

| Type | Description |
|------|-------------|
| `string` | Text values |
| `number` | Numeric values |
| `boolean` | True/false |
| `date` | Date only |
| `timestamp` | Date and time |

### Time Intervals

For `timestamp` and `date` dimensions:
- `RAW`, `YEAR`, `QUARTER`, `MONTH`, `WEEK`, `DAY`
- `HOUR`, `MINUTE`, `SECOND` (timestamp only)
- `YEAR_NUM`, `MONTH_NUM`, `DAY_OF_WEEK_INDEX` (numeric extractions)
- `MONTH_NAME`, `DAY_OF_WEEK_NAME` (text extractions)

### Join Configuration

```yaml
joins:
  - join: customers           # Model name to join
    sql_on: "${orders.customer_id} = ${customers.customer_id}"
    type: left                # inner, left, right, full
    alias: customer           # Optional alias
    label: "Customer Info"    # Display label
    hidden: false             # Hide from UI
    always: false             # Always include in queries
    relationship: many-to-one # one-to-one, one-to-many, many-to-one, many-to-many
    fields:                   # Limit which fields to include
      - name
      - email
```

## CLI Commands

### Authentication

```bash
# Login to Lightdash instance
lightdash login https://app.lightdash.cloud

# Login with token (non-interactive)
lightdash login https://app.lightdash.cloud --token YOUR_API_TOKEN

# List available projects (excludes preview projects)
lightdash config list-projects

# Show currently selected project
lightdash config get-project

# Set active project
lightdash config set-project --name "My Project"
lightdash config set-project --uuid abc123-def456
```

### Compilation & Deployment

```bash
# Compile dbt models and validate
lightdash compile --project-dir ./dbt --profiles-dir ./profiles

# Deploy to Lightdash
lightdash deploy --project-dir ./dbt --profiles-dir ./profiles

# Create new project on deploy
lightdash deploy --create "New Project Name"

# Deploy ignoring validation errors
lightdash deploy --ignore-errors

# Skip dbt compilation (use existing manifest)
lightdash deploy --skip-dbt-compile
```

### Preview Projects

```bash
# Create preview environment (watches for changes)
lightdash preview --name "feature-branch-preview"

# Start preview without watching
lightdash start-preview --name "my-preview"

# Stop preview
lightdash stop-preview --name "my-preview"
```

### Generate YAML

```bash
# Generate schema for all models
lightdash generate

# Generate for specific models
lightdash generate -s my_model
lightdash generate -s tag:sales
lightdash generate -s +my_model  # Include parents
```

### Validation

```bash
# Lint chart and dashboard YAML files
lightdash lint --path ./lightdash

# Validate against Lightdash server
lightdash validate --project my-project-uuid

# Output lint results as JSON/SARIF
lightdash lint --format json
```

### Download & Upload Content

```bash
# Download all charts and dashboards
lightdash download

# Download specific content
lightdash download --charts chart-slug-1 chart-slug-2
lightdash download --dashboards dashboard-slug

# Download with nested folder structure
lightdash download --nested

# Upload modified content
lightdash upload

# Force upload (ignore timestamps)
lightdash upload --force

# Upload specific items
lightdash upload --charts my-chart --dashboards my-dashboard
```

### SQL Runner

Execute raw SQL queries against the warehouse using the current project's credentials. Results are exported to CSV.

```bash
# Run a query and save results to CSV
lightdash sql "SELECT * FROM orders LIMIT 10" -o results.csv

# Limit rows returned
lightdash sql "SELECT * FROM customers" -o customers.csv --limit 1000

# Adjust pagination for large results (default 500, max 5000)
lightdash sql "SELECT * FROM events" -o events.csv --page-size 2000

# Verbose output for debugging
lightdash sql "SELECT COUNT(*) FROM users" -o count.csv --verbose
```

**Options:**
- `<query>` - SQL query to execute (required)
- `-o, --output <file>` - Output CSV file path (required)
- `--limit <number>` - Maximum rows to return
- `--page-size <number>` - Rows per page (default: 500, max: 5000)
- `--verbose` - Show detailed output

**Note:** Uses the warehouse credentials from your currently selected Lightdash project. Run `lightdash config get-project` to see which project is active.

## Chart Configuration

### Chart Types

- `cartesian` - Bar, line, area, scatter charts
- `pie` - Pie and donut charts
- `table` - Data tables with formatting
- `big_number` - Single KPI display
- `funnel` - Funnel visualization
- `treemap` - Hierarchical treemap

### Chart YAML Structure

```yaml
version: 1
name: "Monthly Revenue"
slug: monthly-revenue
spaceSlug: sales-reports
tableName: orders
description: "Revenue trends by month"

metricQuery:
  exploreName: orders
  dimensions:
    - orders_created_at_month
  metrics:
    - orders_total_revenue
  filters:
    dimensions:
      and:
        - target:
            fieldId: orders_status
          operator: equals
          values:
            - completed
  sorts:
    - fieldId: orders_created_at_month
      descending: false
  limit: 500

chartConfig:
  type: cartesian
  config:
    layout:
      xField: orders_created_at_month
      yField:
        - orders_total_revenue
      flipAxes: false
    echartsConfig:
      series:
        - type: bar
          encode:
            xRef: { field: orders_created_at_month }
            yRef: { field: orders_total_revenue }
          yAxisIndex: 0
```

## Dashboard Configuration

```yaml
version: 1
name: "Sales Dashboard"
slug: sales-dashboard
spaceSlug: sales
description: "Overview of sales performance"

tiles:
  # Chart tile
  - type: saved_chart
    x: 0
    y: 0
    w: 12
    h: 6
    properties:
      chartSlug: monthly-revenue
      title: "Revenue Trend"

  # Markdown tile
  - type: markdown
    x: 0
    y: 6
    w: 6
    h: 3
    properties:
      title: "Notes"
      content: |
        ## Key Insights
        - Revenue up 15% MoM
        - Focus on enterprise segment

  # Big number (KPI)
  - type: saved_chart
    x: 6
    y: 6
    w: 3
    h: 3
    properties:
      chartSlug: total-revenue-kpi

tabs:
  - uuid: "tab-1"
    name: "Overview"
    order: 0
  - uuid: "tab-2"
    name: "Details"
    order: 1

filters:
  dimensions:
    - target:
        fieldId: orders_created_at_month
        tableName: orders
      operator: inThePast
      values: [12]
      settings:
        unitOfTime: months
        completed: true
```

## Best Practices

### Metrics

1. **Use descriptive names**: `total_revenue` not `sum1`
2. **Add descriptions**: Help users understand what metrics measure
3. **Set appropriate rounding**: Use `round: 2` for currency
4. **Format for readability**: Use `format: "usd"` or `compact: "millions"`
5. **Define `show_underlying_values`**: List fields users can drill into

### Dimensions

1. **Choose correct types**: Use `timestamp` for datetime, `date` for date-only
2. **Configure time intervals**: Only include intervals users need
3. **Group related fields**: Use `group_label` for organization
4. **Add colors**: Map categorical values to consistent colors

### Joins

1. **Specify relationships**: Helps Lightdash optimize queries
2. **Use descriptive labels**: Clear join names in the UI
3. **Limit fields**: Use `fields` to reduce clutter
4. **Choose correct join type**: `left` preserves base table rows

### Charts

1. **Sort data logically**: Time ascending, rankings descending
2. **Limit data points**: Use appropriate limits (avoid 10,000+ rows)
3. **Use filters**: Pre-filter to relevant data
4. **Match chart to data**: Line for trends, bar for comparisons, pie for parts-of-whole

### Dashboards

1. **Organize with tabs**: Group related charts
2. **Use markdown for context**: Explain insights
3. **Set dashboard filters**: Allow users to slice data
4. **Consistent sizing**: Align tiles to grid

## Resources

For detailed reference documentation:

- [Dimensions Reference](./resources/dimensions-reference.md) - Complete dimension configuration
- [Metrics Reference](./resources/metrics-reference.md) - All metric types and options
- [Tables Reference](./resources/tables-reference.md) - Table/model configuration
- [Joins Reference](./resources/joins-reference.md) - Join configuration guide
- [Chart Types Reference](./resources/chart-types-reference.md) - All chart configurations
- [Dashboard Reference](./resources/dashboard-reference.md) - Dashboard configuration
- [Workflows Reference](./resources/workflows-reference.md) - CI/CD and deployment patterns

## JSON Schemas

The skill includes JSON schemas for validation:

- `chart-as-code-1.0.json` - Chart YAML validation
- `dashboard-as-code-1.0.json` - Dashboard YAML validation
- `model-as-code-1.0.json` - Model YAML validation

## External Documentation

- [Lightdash Docs](https://docs.lightdash.com) - Official documentation
- [Metrics Reference](https://docs.lightdash.com/references/metrics)
- [Dimensions Reference](https://docs.lightdash.com/references/dimensions)
- [Tables Reference](https://docs.lightdash.com/references/tables)
- [Joins Reference](https://docs.lightdash.com/references/joins)
