# Design Pattern Generation Reference

Verified content represents a team's approved, trusted analytics. By analyzing verified charts and dashboards, you can automatically extract the design patterns a company relies on and generate a project-specific design guide.

## Why Generate Design Patterns?

Teams develop implicit conventions over time — preferred chart types, key metrics, formatting standards — but rarely document them. By analyzing verified content (the charts and dashboards an admin has explicitly approved), you can surface these patterns and produce an editable design guide that helps new content stay consistent.

## Workflow

### Step 1: List Verified Content

Use the API to get all verified charts and dashboards in a project:

```bash
# List all verified content
curl -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/content-verification"
```

This returns each verified item with its UUID, name, content type (chart or dashboard), space, and verification metadata.

### Step 2: Download Verified Content as YAML

Download the verified charts and dashboards using the CLI:

```bash
# Download specific charts by slug
lightdash download --charts monthly-revenue weekly-active-users

# Download specific dashboards by slug
lightdash download --dashboards sales-overview executive-kpis

# Download all charts (then filter to verified ones)
lightdash download --charts
```

The downloaded YAML files appear in the `lightdash/` directory and include the full chart configuration: chart type, metrics, dimensions, formatting, filters, and verification status.

### Step 3: Analyze Patterns

Read the downloaded YAML files and extract patterns across verified content. Focus on:

**Chart type distribution** — Which visualization types are used and for what purposes:
- How many bar charts vs line charts vs tables vs big numbers?
- What data is shown in each type? (e.g., "bar charts for category comparisons, line charts for time series")

**Key metrics** — The most frequently used metrics:
- Which metrics appear in 3+ verified charts? These are the ones the team relies on heavily.
- What aggregation types are used (sum, count, count_distinct, average)?
- What formatting is applied (currency, percentage, compact notation)?

**Common dimensions** — How data is typically broken down:
- What time granularities are used (day, week, month, year)?
- What categorical breakdowns are common (region, team, product, status)?

**Formatting conventions** — Consistent styling choices:
- Number formats (decimal places, currency symbols, compact notation)
- Color schemes and conditional formatting rules
- Axis labels and chart titles

**Dashboard layout patterns** — How content is organized:
- How many tiles per dashboard?
- Are KPI/big number tiles placed at the top?
- What dashboard filters are commonly applied?
- How are tabs used to organize content?

**Naming conventions** — How things are named:
- Chart naming patterns (e.g., "Monthly Revenue by Region")
- Dashboard naming patterns (e.g., "Sales Overview")
- Space organization (e.g., finance, marketing, product)

### Step 4: Generate the Design Guide

Produce a markdown file documenting the patterns found. Save it to a location the user specifies (e.g., `docs/design-patterns.md` or in the project's `lightdash/` directory).

## Example Output

```markdown
# Acme Corp Analytics Design Patterns

Generated from 12 verified charts and 3 verified dashboards.

## Chart Type Preferences

- **Big Numbers (KPIs)**: Used for headline metrics — total revenue, active users,
  conversion rate. Always placed in the top row of dashboards.
- **Bar Charts**: Used for category comparisons — revenue by region, users by plan.
  Horizontal orientation preferred when > 5 categories.
- **Line Charts**: Used for time series trends — monthly revenue, weekly signups.
  Always use month granularity for executive dashboards.
- **Tables**: Used for detailed breakdowns — order details, customer lists.
  Include conditional formatting for status columns.

## Key Metrics

| Metric | Type | Format | Appears In |
|--------|------|--------|------------|
| total_revenue | sum | USD, 2 decimals | 8 charts |
| active_users | count_distinct | compact (1.2K) | 5 charts |
| conversion_rate | number | percentage, 1 decimal | 4 charts |
| orders_count | count | number | 3 charts |

## Formatting Standards

- **Currency**: USD format with 2 decimal places
- **Percentages**: 1 decimal place (e.g., 12.5%)
- **Large numbers**: Compact notation (1.2M, 3.4K)
- **Dates**: Month granularity for trends, day for operational views

## Dashboard Conventions

- **Executive dashboards**: 6-8 tiles, KPIs across the top row, trends below
- **Team dashboards**: Date range filter + team filter on every dashboard
- **Tabs**: Used to separate "Overview" from "Details"

## Naming Conventions

- Charts: "[Frequency] [Metric] by [Dimension]" (e.g., "Monthly Revenue by Region")
- Dashboards: "[Team/Domain] [Purpose]" (e.g., "Sales Overview", "Product Health")
- Spaces: Named by business domain (Finance, Marketing, Product)
```

## Tips for Better Results

- **Focus on verified content only** — these are the approved patterns, not experiments
- **Group by space** to identify team-specific patterns vs company-wide conventions
- **Flag inconsistencies** — if some charts use 2 decimal places and others use 0, note this as an opportunity for standardization
- **Include the "why"** — don't just list patterns, explain what each chart type is used for
- **Make it editable** — the generated guide is a starting point; teams should refine it to match their intentions, not just their current state
- **Re-generate periodically** — as verified content evolves, regenerate to keep the guide current

## Related

- [Content Verification Reference](./content-verification-reference.md) — How to verify and manage content
- [CLI Reference](./cli-reference.md) — Commands for downloading and uploading content
- [Dashboard Best Practices](./dashboard-best-practices.md) — General dashboard design guidance
