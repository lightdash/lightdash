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

Permanently delete charts and dashboards from the server and remove their local YAML files.

```bash
# Delete a chart by slug
lightdash delete -c my-chart

# Delete a dashboard by slug
lightdash delete -d my-dashboard

# Delete multiple items at once
lightdash delete -c chart1 chart2 -d dashboard1

# Delete by UUID
lightdash delete -c abc123-def456

# Delete by URL
lightdash delete -c "https://app.lightdash.cloud/projects/xxx/saved/abc123"

# Skip confirmation prompt (use with caution)
lightdash delete -c my-chart --force

# Use custom path for local files
lightdash delete -c my-chart --path ./custom-lightdash

# Delete from a specific project
lightdash delete -c my-chart --project <project-uuid>
```

**Options:**
- `-c, --charts <charts...>` - Chart slugs, UUIDs, or URLs to delete
- `-d, --dashboards <dashboards...>` - Dashboard slugs, UUIDs, or URLs to delete
- `-f, --force` - Skip confirmation prompt
- `-p, --path <path>` - Custom path where local chart-as-code files are stored
- `--project <uuid>` - Specify a project UUID

**Warning:** The delete command will warn you if any charts being deleted are referenced by dashboards.

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

## Command Summary

| Command | Purpose |
|---------|---------|
| `lightdash login` | Authenticate with Lightdash |
| `lightdash config` | Manage project selection |
| `lightdash deploy` | Sync semantic layer to Lightdash |
| `lightdash upload` | Upload charts/dashboards |
| `lightdash download` | Download charts/dashboards |
| `lightdash delete` | Remove charts/dashboards |
| `lightdash preview` | Create temporary test project |
| `lightdash validate` | Validate against server |
| `lightdash lint` | Validate YAML locally |
| `lightdash generate` | Generate YAML from dbt models |
| `lightdash sql` | Run SQL queries |
