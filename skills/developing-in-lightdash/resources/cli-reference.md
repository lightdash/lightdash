# CLI Reference

Complete reference for Lightdash CLI commands.

## Authentication

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

## Compilation & Deployment

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

# Pure Lightdash YAML (no dbt)
lightdash deploy --no-warehouse-credentials
```

## Preview Projects

```bash
# Create preview environment (watches for changes)
lightdash preview --name "feature-branch-preview"

# Start preview without watching
lightdash start-preview --name "my-preview"

# Stop preview
lightdash stop-preview --name "my-preview"
```

## Generate YAML

```bash
# Generate schema for all models
lightdash generate

# Generate for specific models
lightdash generate -s my_model
lightdash generate -s tag:sales
lightdash generate -s +my_model  # Include parents
```

## Validation

```bash
# Lint chart and dashboard YAML files locally (offline)
lightdash lint --path ./lightdash

# Validate against Lightdash server
lightdash validate --project my-project-uuid

# Output lint results as JSON/SARIF
lightdash lint --format json
```

## Download & Upload Content

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

## Delete Content

```bash
There is no `lightdash delete` CLI command. Use one of the following approaches instead.

### Via the Lightdash UI

For charts and dashboards visible in the UI:

1. Navigate to the chart or dashboard
2. Open the three-dot menu → **Delete**

### Via the REST API (v2)

Use the [v2 API](https://docs.lightdash.com/api-reference/v2) to delete content programmatically. Both endpoints accept a UUID **or** slug.
When you need this: Charts created via lightdash upload with a dashboardSlug are scoped to that dashboard and may not appear in the UI. They still show up in lightdash download output. Use the API to remove these orphaned charts.

[Delete a chart](https://docs.lightdash.com/api-reference/v2/delete-chart)
curl -s -X DELETE -H "Authorization: ApiKey $LIGHTDASH_API_KEY" \
  "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/saved/$CHART_UUID_OR_SLUG"

[Delete a dashboard](https://docs.lightdash.com/api-reference/v2/delete-dashboard)
curl -s -X DELETE -H "Authorization: ApiKey $LIGHTDASH_API_KEY" \
  "$LIGHTDASH_URL/api/v2/projects/$PROJECT_UUID/dashboards/$DASHBOARD_UUID_OR_SLUG"

Note: The v1 endpoints (/api/v1/saved/{identifier}, /api/v1/dashboards/{identifier}) only accept UUIDs — passing a slug returns a generic error. Prefer the v2 endpoints above.
```

## SQL Runner

Execute raw SQL queries against the warehouse using the current project's credentials.

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

**Note:** Uses warehouse credentials from your currently selected Lightdash project.

## Run Chart

Execute a chart YAML file's metric query against the warehouse. Only supports metric query charts (with `tableName` and `metricQuery`), not SQL charts.

```bash
# Verify a chart query runs successfully
lightdash run-chart -p ./lightdash/charts/monthly-revenue.yml

# Run chart and save results to CSV
lightdash run-chart -p ./lightdash/charts/monthly-revenue.yml -o results.csv

# Limit rows returned
lightdash run-chart -p ./lightdash/charts/monthly-revenue.yml -o results.csv -l 100

# Adjust pagination for large results
lightdash run-chart -p ./lightdash/charts/monthly-revenue.yml -o results.csv --page-size 2000

# Verbose output for debugging
lightdash run-chart -p ./lightdash/charts/monthly-revenue.yml --verbose
```

**Options:**

- `-p, --path <path>` - Path to chart YAML file (required)
- `-o, --output <file>` - Output CSV file path
- `-l, --limit <number>` - Maximum rows to return
- `--page-size <number>` - Rows per page (default: 500)
- `--verbose` - Show detailed output

**Note:**

- Uses warehouse credentials from your currently selected Lightdash project.
- The chart YAML must contain `tableName` and `metricQuery` fields.
- All semantic layer fields referenced in the metric query (dimensions, metrics, custom dimensions, etc.) must already be deployed to the Lightdash project.

## Set Warehouse Connection

Update the warehouse connection on an existing Lightdash project from your dbt profiles.yml.

```bash
# Update warehouse connection from profiles.yml
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles

# With target and profile overrides
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles --target prod --profile my_profile

# Target a specific project
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles --project <uuid>

# Non-interactive (skip prompts)
lightdash set-warehouse --project-dir ./dbt --profiles-dir ./profiles --assume-yes
```

**Options:**

- `--project-dir <path>` - The directory of the dbt project (default: `.`)
- `--profiles-dir <path>` - The directory of the dbt profiles (default: `~/.dbt`)
- `--target <name>` - dbt target name override
- `--profile <name>` - dbt profile name override
- `--target-path <path>` - Override the dbt target directory
- `--project <uuid>` - Lightdash project UUID to update (defaults to currently selected project)
- `--start-of-week <number>` - First day of week, 0 (Monday) to 6 (Sunday)
- `-y, --assume-yes` - Skip confirmation prompts
- `--verbose` - Show detailed output

**Note:** This command reads warehouse credentials from profiles.yml, updates the connection on the project, and triggers a recompile. Run this before `lightdash deploy` if the project needs a different warehouse connection.

## Command Summary

| Command               | Purpose                          |
| --------------------- | -------------------------------- |
| `lightdash login`     | Authenticate with Lightdash      |
| `lightdash config`    | Manage project selection         |
| `lightdash deploy`    | Sync semantic layer to Lightdash |
| `lightdash upload`    | Upload charts/dashboards         |
| `lightdash download`  | Download charts/dashboards       |
| REST API `DELETE`     | Remove charts/dashboards         |
| `lightdash preview`   | Create temporary test project    |
| `lightdash validate`  | Validate against server          |
| `lightdash lint`      | Validate YAML locally            |
| `lightdash generate`  | Generate YAML from dbt models    |
| `lightdash sql`       | Run SQL queries                  |
| `lightdash run-chart` | Execute chart YAML query         |
| `lightdash set-warehouse` | Update project warehouse connection |
