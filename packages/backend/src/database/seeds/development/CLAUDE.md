# Dashboard Data Extraction Guide

## Overview

This document describes the process of extracting an existing dashboard from a Lightdash database and converting it into a seed file for development/testing purposes.

## Prerequisites

-   Access to PostgreSQL database with existing dashboard data
-   Understanding of Lightdash database schema
-   Node.js/TypeScript development environment

## Database Schema Overview

Key tables for dashboard extraction:

-   `dashboards` - Main dashboard metadata
-   `dashboard_versions` - Dashboard version history
-   `dashboard_tiles` - Tile positioning and types
-   `dashboard_tile_charts` - Chart tile references
-   `dashboard_tile_markdowns` - Markdown tile content
-   `saved_queries` - Chart definitions
-   `saved_queries_versions` - Chart version details
-   `saved_queries_version_fields` - Chart dimensions/metrics
-   `saved_queries_version_sorts` - Chart sorting

## Step-by-Step Extraction Process

### 1. Identify Target Dashboard

```sql
-- Get dashboard metadata
SELECT dashboard_uuid, name, description, slug
FROM dashboards
WHERE dashboard_uuid = '8542a1ed-ba86-4e1f-8604-33a38e274189';
```

### 2. Get Latest Dashboard Version

```sql
-- Get latest version ID and configuration
SELECT dv.dashboard_version_id, dv.config
FROM dashboard_versions dv
JOIN dashboards d ON d.dashboard_id = dv.dashboard_id
WHERE d.dashboard_uuid = '8542a1ed-ba86-4e1f-8604-33a38e274189'
ORDER BY dv.created_at DESC LIMIT 1;
```

### 3. Extract Dashboard Tiles

```sql
-- Get unique tiles with their positions
SELECT DISTINCT
    dt.dashboard_tile_uuid,
    dt.type,
    dt.x_offset,
    dt.y_offset,
    dt.height,
    dt.width,
    dtc.saved_chart_id
FROM dashboard_tiles dt
LEFT JOIN dashboard_tile_charts dtc ON dt.dashboard_tile_uuid = dtc.dashboard_tile_uuid
WHERE dt.dashboard_version_id = 29
ORDER BY dt.y_offset, dt.x_offset;
```

### 4. Extract Markdown Tiles

```sql
-- Get markdown content
SELECT title, content
FROM dashboard_tile_markdowns
WHERE dashboard_tile_uuid = '7d1c8510-9ebe-494f-9465-1d84ac2fbb53';
```

### 5. Extract Chart Configurations

Create comprehensive extraction query:

```sql
-- Save to /tmp/extract_charts.sql
SELECT json_agg(chart_data ORDER BY saved_query_id) AS charts
FROM (
    SELECT
        sq.saved_query_id,
        sq.saved_query_uuid,
        sq.name,
        sq.description,
        sqv.explore_name,
        sqv.filters,
        sqv.row_limit,
        sqv.chart_type,
        sqv.chart_config,
        sqv.pivot_dimensions,
        sqv.metric_overrides,
        (
            SELECT json_agg(json_build_object(
                'name', name,
                'field_type', field_type
            ) ORDER BY "order")
            FROM saved_queries_version_fields
            WHERE saved_queries_version_id = sqv.saved_queries_version_id
        ) AS fields,
        (
            SELECT json_agg(json_build_object(
                'field_name', field_name,
                'descending', descending
            ) ORDER BY "order")
            FROM saved_queries_version_sorts
            WHERE saved_queries_version_id = sqv.saved_queries_version_id
        ) AS sorts
    FROM saved_queries sq
    JOIN saved_queries_versions sqv ON sq.saved_query_id = sqv.saved_query_id
    WHERE sq.saved_query_id IN (36, 37, 38, 40, 41, 42, 43, 44, 45, 46)
    AND sqv.saved_queries_version_id IN (
        SELECT DISTINCT ON (saved_query_id) saved_queries_version_id
        FROM saved_queries_versions
        WHERE saved_query_id IN (36, 37, 38, 40, 41, 42, 43, 44, 45, 46)
        ORDER BY saved_query_id, created_at DESC
    )
) AS chart_data;
```

Execute and save:

```bash
psql -t -A -f /tmp/extract_charts_<dashboard_uuid>_<random_suffix>.sql > /tmp/charts_data_<dashboard_uuid>_<random_suffix>.json
```

### 6. Analyze Chart Patterns

```bash
# View pivot configurations
cat /tmp/charts_data.json | jq '.[] | {
    id: .saved_query_id,
    name: .name,
    pivot_dimensions: .pivot_dimensions,
    metricsAsRows: .chart_config.metricsAsRows
}'

# Check conditional formatting
cat /tmp/charts_data.json | jq '.[] | {
    id: .saved_query_id,
    name: .name,
    hasConditionalFormatting: (.chart_config.conditionalFormattings != null)
}'

# List dimensions per chart
cat /tmp/charts_data.json | jq -r '.[] |
    "Chart \(.saved_query_id): \(.fields |
    map(select(.field_type == "dimension") | .name) |
    join(", "))"'
```

### 7. Check Dashboard Filters and Tabs

```sql
-- Check dashboard-level filters
SELECT filters FROM dashboard_views WHERE dashboard_version_id = 29;

-- Check tabs
SELECT * FROM dashboard_tabs WHERE dashboard_version_id = 29;
```

## Converting to Seed File

### Structure Template

```typescript
import {
    ChartType,
    DashboardTileTypes,
    FilterOperator,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

async function createCharts(knex: Knex): Promise<ChartUuids> {
    // Create each chart using SavedChartModel
    // Apply conditional formatting
    // Set pivot configurations
}

async function createDashboard(knex: Knex, chartUuids: ChartUuids) {
    // Create dashboard with DashboardModel
    // Position tiles according to extracted layout
    // Apply hardcoded UUID if needed
}

export async function seed(knex: Knex): Promise<void> {
    const chartUuids = await createCharts(knex);
    await createDashboard(knex, chartUuids);
}
```

### Key Conversion Points

1. **Conditional Formatting**: Extract from `chart_config.conditionalFormattings`
2. **Pivot Configuration**: Map `pivot_dimensions` to `pivotConfig.columns`
3. **Metrics as Rows**: Extract from `chart_config.metricsAsRows`
4. **Column Order**: Build from fields array
5. **Tile Layout**: Preserve exact x, y, width, height values

### Hardcoding Dashboard UUID

```typescript
// After dashboard creation
const HARDCODED_DASHBOARD_UUID = '8542a1ed-ba86-4e1f-8604-33a38e274189';
await knex.raw(
    `UPDATE dashboards SET dashboard_uuid = ? WHERE dashboard_uuid = ?`,
    [HARDCODED_DASHBOARD_UUID, dashboard.uuid],
);
```

## Common Issues

1. **Duplicate Tiles**: Use `DISTINCT` in SQL queries
2. **Missing References**: Ensure all chart IDs exist before creating tiles
3. **Type Mismatches**: Check nullable fields and optional properties
4. **UUID Conflicts**: Dashboard UUIDs must be unique across database

## SQL Helper Queries

```sql
-- List all dashboard-related tables
\dt dash*

-- Check table structure
\d dashboards
\d dashboard_tiles
\d saved_queries

-- Find related charts for a dashboard
SELECT sq.* FROM saved_queries sq
WHERE sq.saved_query_id IN (
    SELECT dtc.saved_chart_id
    FROM dashboard_tile_charts dtc
    JOIN dashboard_tiles dt ON dt.dashboard_tile_uuid = dtc.dashboard_tile_uuid
    WHERE dt.dashboard_version_id = [version_id]
);
```

## Notes

-   Always extract from latest dashboard version
-   Preserve exact conditional formatting rules with new UUIDs
-   Maintain tile positioning for consistent layout
-   Use existing seed data references (SEED_PROJECT, SEED_ORG_1_ADMIN)
-   Consider data dependencies when ordering seed files

Do not run the created seed file until prompted by the user

Reference:

-   @/packages/backend/src/database/seeds/development/07_cartesian_charts_dashboard.ts
