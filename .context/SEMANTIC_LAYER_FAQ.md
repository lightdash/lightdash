# Lightdash Semantic Layer FAQ

## Overview

This document answers common questions about Lightdash's semantic layer architecture, its relationship with dbt, and how to handle cross-domain analytics.

---

## Q1: What is the difference between dbt Semantic Layer and Lightdash Semantic Layer?

### dbt Semantic Layer (MetricFlow)

The dbt Semantic Layer is a standalone feature introduced by dbt Labs as part of dbt Cloud (version 1.6+):

- **Definition Location**: Separate `semantic_models` and `metrics` files in YAML
- **Access Pattern**: API-accessible via dbt Cloud APIs
- **Calculation**: Server-side metric calculation via dbt Cloud
- **Requirements**: Requires dbt Cloud subscription
- **Integration**: Accessible through dbt Cloud integrations and SDKs

Example dbt Semantic Layer definition:
```yaml
# semantic_models/orders.yml
semantic_models:
  - name: orders
    entities:
      - name: order_id
        type: primary
    dimensions:
      - name: order_date
        type: time
    measures:
      - name: total_revenue
        agg: sum
        expr: amount

metrics:
  - name: revenue
    type: simple
    type_params:
      measure: total_revenue
```

### Lightdash Semantic Layer

Lightdash's semantic layer is built as an **overlay on dbt models**, not a separate system:

- **Definition Location**: dbt model YAML files using `meta` tags
- **Access Pattern**: Web UI + Query Builder
- **Calculation**: Query-time calculation via Lightdash backend
- **Requirements**: Works with dbt Core or dbt Cloud
- **Integration**: Direct data warehouse connection

Example Lightdash Semantic Layer definition:
```yaml
# models/schema.yml
models:
  - name: orders
    meta:
      metrics:
        total_revenue:
          type: sum
          sql: ${TABLE}.amount
      dimensions:
        order_date:
          type: date
          sql: ${TABLE}.order_date
```

### Key Differences Summary

| Aspect | dbt Semantic Layer | Lightdash Semantic Layer |
|--------|-------------------|--------------------------|
| **Architecture** | Standalone API service | Embedded in dbt YAML |
| **Definition Files** | Separate semantic_model files | Model YAML with meta tags |
| **Access** | API/SDK | Web UI + API |
| **Calculation** | dbt Cloud server | Lightdash backend |
| **dbt Version** | dbt Cloud 1.6+ | dbt Core or Cloud |
| **Integration** | Via dbt Cloud APIs | Direct warehouse queries |

### Important Note on Integration

**Lightdash does not integrate with dbt's native MetricFlow/Semantic Layer.**

The codebase history shows that:
- Migration `20240927114532_add-semantic-layer-connection.ts` initially added support
- Migration `20250626142619_remove_project_semantic_layer_connection.ts` **removed** this feature

Lightdash reads dbt `manifest.json` for model structure but does not parse `semantic_models` definitions.

---

## Q2: How do we keep both semantic layers connected when using dbt Labs as the source of truth?

### The Current Reality

**There is no automatic synchronization between dbt Semantic Layer and Lightdash Semantic Layer.**

Lightdash operates independently of dbt's semantic layer and reads only from:
- `manifest.json` (model structure and metadata)
- `meta` tags in dbt model YAML files

### Recommended Architecture: Single Source of Truth

Since you want dbt as the source of truth, use this approach:

```
dbt Project (Source of Truth)
├── Transformations: dbt models (.sql files)
├── Data Quality: dbt tests
└── Semantic Definitions: dbt YAML meta tags
        ↓
    Lightdash reads manifest.json
        ↓
    Generates Explores with metrics & dimensions
```

### Workflow

1. **Define transformations in dbt models**:
   ```sql
   -- models/orders.sql
   SELECT
     order_id,
     customer_id,
     order_date,
     amount
   FROM {{ ref('raw_orders') }}
   ```

2. **Define semantic layer in dbt YAML**:
   ```yaml
   # models/schema.yml
   models:
     - name: orders
       description: "Order transactions"
       columns:
         - name: order_id
           description: "Unique order identifier"
       meta:
         metrics:
           total_revenue:
             type: sum
             sql: ${TABLE}.amount
             description: "Total revenue from orders"

           order_count:
             type: count_distinct
             sql: ${TABLE}.order_id
             description: "Number of unique orders"

         dimensions:
           order_date:
             type: date
             sql: ${TABLE}.order_date

           customer_id:
             type: string
             sql: ${TABLE}.customer_id
   ```

3. **Version control together**: All definitions live in the same git repository

4. **Deploy pipeline**:
   ```
   Git Commit → CI/CD → dbt run → Lightdash refresh
   ```

### Benefits of This Approach

✅ **Single source of truth**: All semantic definitions in dbt YAML
✅ **No dual maintenance**: Define metrics once
✅ **Version control**: Full history of changes
✅ **Code review**: Changes go through normal PR process
✅ **Co-location**: Semantic layer next to transformation logic

### What About dbt Semantic Layer?

If you're also using dbt's semantic layer for other tools, you'll need to maintain separate definitions:
- **dbt Semantic Layer**: For dbt Cloud integrations and MetricFlow-compatible tools
- **Lightdash meta tags**: For Lightdash visualization and exploration

This is unavoidable given the current architecture.

---

## Q3: How can we combine different domains/marts (e.g., Customer Care + Sales) for advanced analytics?

### Current Limitation

**Lightdash uses a single-explore-per-query architecture.** There is no built-in capability to query across:
- Multiple projects
- Multiple spaces
- Multiple base explores

Each query is scoped to:
- One project
- One explore
- One base table (with optional joined tables)

### Solution Options

#### Option 1: Define Joins in dbt YAML (Recommended for Related Tables)

Create a base explore that joins multiple domains:

```yaml
# models/schema.yml
models:
  - name: customer_analysis
    meta:
      joins:
        - join: customer_care_tickets
          sql_on: "${customer_analysis.customer_id} = ${customer_care_tickets.customer_id}"
          relationship: one-to-many

        - join: sales_orders
          sql_on: "${customer_analysis.customer_id} = ${sales_orders.customer_id}"
          relationship: one-to-many

      metrics:
        ticket_count:
          type: count_distinct
          sql: ${customer_care_tickets.ticket_id}

        total_revenue:
          type: sum
          sql: ${sales_orders.amount}
```

**Limitations**:
- Both tables must be in the same dbt project
- Must be accessible from the same base table
- Join relationships must be defined upfront

**Reference**: `skills/developing-in-lightdash/resources/joins-reference.md`

#### Option 2: Create Unified dbt Model (Recommended for Cross-Domain Analytics)

Pre-join data from both domains in a new dbt model:

```sql
-- models/ai_analytics/customer_care_sales_analysis.sql

{{
  config(
    materialized='table',
    tags=['ai_analytics']
  )
}}

WITH customer_care_metrics AS (
  SELECT
    customer_id,
    region,
    DATE_TRUNC('week', ticket_created_at) as week,
    COUNT(DISTINCT ticket_id) as ticket_count,
    AVG(resolution_time_hours) as avg_resolution_time
  FROM {{ ref('fct_customer_care_tickets') }}
  WHERE ticket_created_at >= DATEADD(month, -6, CURRENT_DATE)
  GROUP BY 1, 2, 3
),

sales_metrics AS (
  SELECT
    customer_id,
    region,
    DATE_TRUNC('week', order_date) as week,
    COUNT(DISTINCT order_id) as order_count,
    SUM(amount) as revenue
  FROM {{ ref('fct_sales') }}
  WHERE order_date >= DATEADD(month, -6, CURRENT_DATE)
  GROUP BY 1, 2, 3
)

SELECT
  COALESCE(cc.customer_id, s.customer_id) as customer_id,
  COALESCE(cc.region, s.region) as region,
  COALESCE(cc.week, s.week) as week,
  COALESCE(cc.ticket_count, 0) as ticket_count,
  COALESCE(cc.avg_resolution_time, 0) as avg_resolution_time,
  COALESCE(s.order_count, 0) as order_count,
  COALESCE(s.revenue, 0) as revenue
FROM customer_care_metrics cc
FULL OUTER JOIN sales_metrics s
  ON cc.customer_id = s.customer_id
  AND cc.region = s.region
  AND cc.week = s.week
```

Then define Lightdash metrics on this model:

```yaml
# models/ai_analytics/schema.yml
models:
  - name: customer_care_sales_analysis
    description: "Combined view of customer care and sales metrics for correlation analysis"
    meta:
      metrics:
        ticket_count:
          type: sum
          sql: ${TABLE}.ticket_count
          description: "Total support tickets"

        revenue:
          type: sum
          sql: ${TABLE}.revenue
          description: "Total sales revenue"

        tickets_per_1k_revenue:
          type: number
          sql: (${ticket_count} / NULLIF(${revenue}, 0)) * 1000
          description: "Support tickets per $1K revenue"

      dimensions:
        week:
          type: date
          sql: ${TABLE}.week
          time_intervals: [DAY, WEEK, MONTH]

        region:
          type: string
          sql: ${TABLE}.region
```

**Benefits**:
- ✅ Pre-computed, optimized for analysis
- ✅ Can combine any tables from any schema
- ✅ Supports complex aggregation logic
- ✅ Single explore for all cross-domain queries

#### Option 3: SQL Runner (Ad-Hoc Queries)

Use Lightdash SQL Runner to write raw SQL across schemas:

```sql
-- Ad-hoc query in SQL Runner
SELECT
  t.region,
  t.week,
  COUNT(DISTINCT t.ticket_id) as ticket_count,
  SUM(s.revenue) as revenue
FROM analytics.customer_care_tickets t
LEFT JOIN analytics.sales s
  ON t.customer_id = s.customer_id
  AND DATE_TRUNC('week', t.ticket_created_at) = DATE_TRUNC('week', s.order_date)
WHERE t.ticket_created_at >= DATEADD(month, -3, CURRENT_DATE)
GROUP BY 1, 2
ORDER BY 1, 2
```

**Limitations**:
- ❌ Not backed by explore definitions
- ❌ Limited chart type support
- ❌ Cannot save as reusable explores
- ✅ Good for one-off analysis

**Reference**: `packages/backend/src/controllers/sqlRunnerController.ts`

#### Option 4: Dashboard with Multiple Charts

Create separate charts from different explores and combine on one dashboard:

```yaml
Dashboard: "Customer Care & Sales Overview"
  Chart 1: Customer Care Metrics
    - Source: customer_care_tickets explore
    - Metrics: ticket_count, avg_resolution_time
    - Dimension: region, week

  Chart 2: Sales Metrics
    - Source: sales_orders explore
    - Metrics: revenue, order_count
    - Dimension: region, week

  Dashboard Filters:
    - region (synced across all charts)
    - date_range (synced across all charts)
```

**Limitations**:
- ❌ No server-side joining
- ❌ Correlation analysis must be done visually
- ✅ Easy to implement
- ✅ Good for side-by-side comparison

### For AI-Driven Correlation Analysis

For use cases like "detect correlation between ticket increases and sales decreases in specific regions":

#### Recommended Implementation

1. **Create unified dbt model** (Option 2 above) with weekly/daily grain

2. **Define correlation metrics** in Lightdash:
   ```yaml
   meta:
     metrics:
       ticket_trend:
         type: number
         sql: (${ticket_count} - LAG(${ticket_count}) OVER (PARTITION BY region ORDER BY week)) / NULLIF(LAG(${ticket_count}) OVER (PARTITION BY region ORDER BY week), 0)

       revenue_trend:
         type: number
         sql: (${revenue} - LAG(${revenue}) OVER (PARTITION BY region ORDER BY week)) / NULLIF(LAG(${revenue}) OVER (PARTITION BY region ORDER BY week), 0)
   ```

3. **Export data for AI processing**:
   - Use Lightdash Query Builder to filter and aggregate
   - Export results via API or CSV
   - Process in external AI/ML pipeline for correlation detection

4. **API Integration Example**:
   ```typescript
   // Query Lightdash API
   const response = await fetch(`${LIGHTDASH_URL}/api/v1/projects/${projectId}/explores/${exploreId}/runQuery`, {
     method: 'POST',
     body: JSON.stringify({
       dimensions: ['region', 'week'],
       metrics: ['ticket_count', 'revenue'],
       filters: {
         dimensions: {
           region: { values: ['DE'] }
         }
       }
     })
   });

   const data = await response.json();

   // Send to AI service for correlation analysis
   const correlationResult = await aiService.detectCorrelations(data);
   ```

**Reference**: `packages/backend/src/controllers/exploreController.ts:36-93`

### Note on AI Copilot Feature

Lightdash Enterprise Edition includes an AI Copilot feature that can:
- Assist with query generation
- Suggest relevant dimensions and metrics

However, it does **not** automatically perform correlation analysis or cross-domain insights.

**Reference**: `packages/backend/src/ee/services/ai/tools/runQuery.ts`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     dbt Project                         │
│                  (Source of Truth)                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌──────────────────┐            │
│  │  Transformations│  │  Data Quality    │            │
│  │  (dbt models)   │  │  (dbt tests)     │            │
│  └─────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │       Semantic Layer                            │  │
│  │       (YAML meta tags)                          │  │
│  │  - Metrics: revenue, order_count, etc.         │  │
│  │  - Dimensions: date, region, customer          │  │
│  │  - Joins: cross-domain relationships           │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
               manifest.json generation
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Lightdash                            │
├─────────────────────────────────────────────────────────┤
│  1. Reads manifest.json                                 │
│  2. Parses meta tags                                    │
│  3. Generates Explores                                  │
│  4. Builds SQL queries                                  │
│  5. Executes against warehouse                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Use Cases                              │
├─────────────────────────────────────────────────────────┤
│  • Interactive exploration (Query Builder)              │
│  • Dashboards & visualizations                          │
│  • Scheduled reports                                    │
│  • API access for external tools                        │
│  • Data export for AI/ML pipelines                      │
└─────────────────────────────────────────────────────────┘
```

---

## Code References

### Semantic Layer Architecture
- `packages/backend/src/projectAdapters/dbtBaseProjectAdapter.ts:147-307` - Main compilation pipeline
- `packages/common/src/compiler/translator.ts:911-1100` - Explore conversion from dbt models
- `packages/common/src/types/dbt.ts:109-250` - Lightdash metric and dimension type definitions

### Query Execution
- `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` - Single-explore query builder
- `packages/common/src/types/explore.ts:24-84` - Explore structure with joins
- `packages/backend/src/controllers/exploreController.ts:36-93` - Query execution API

### Joins Configuration
- `skills/developing-in-lightdash/resources/joins-reference.md` - Complete joins documentation

### Migration History
- `packages/backend/src/database/migrations/20240927114532_add-semantic-layer-connection.ts` - Added dbt semantic layer connection
- `packages/backend/src/database/migrations/20250626142619_remove_project_semantic_layer_connection.ts` - Removed dbt semantic layer integration

---

## Summary & Recommendations

### For Questions 1 & 2: Semantic Layer Strategy

1. **Use Lightdash as your semantic layer**: Define all metrics and dimensions in dbt YAML `meta` tags
2. **Keep dbt as transformation source of truth**: All SQL logic and data quality rules in dbt
3. **Version control together**: Semantic definitions live in the same repo as dbt code
4. **No dual maintenance needed**: One set of metric definitions in dbt YAML

### For Question 3: Cross-Domain Analytics

1. **Create unified dbt models**: Pre-join Customer Care and Sales data in dedicated analytics models
2. **Define analysis-specific metrics**: Support-to-sales ratios, correlation indicators
3. **Use Lightdash for exploration**: Build interactive dashboards on unified models
4. **Export for AI processing**: Use Lightdash API to extract data for external correlation analysis
5. **Consider materialization**: Use dbt incremental models for performance on large datasets

### Best Practices

✅ **Co-locate semantic definitions with models**: Keep metrics close to transformation logic
✅ **Use descriptive names**: Make metrics and dimensions self-documenting
✅ **Document business logic**: Add descriptions to all metrics and dimensions
✅ **Test your metrics**: Use dbt tests to validate metric calculations
✅ **Version control everything**: Treat semantic layer as code
✅ **Plan for scale**: Use materialized tables for cross-domain analytics
✅ **Export for advanced analytics**: Don't try to force all analysis into Lightdash UI

---

## Related Documentation

- [Joins Reference](skills/developing-in-lightdash/resources/joins-reference.md)
- [Metrics Reference](skills/developing-in-lightdash/resources/metrics-reference.md)
- [Dimensions Reference](skills/developing-in-lightdash/resources/dimensions-reference.md)
- [Tables Reference](skills/developing-in-lightdash/resources/tables-reference.md)

---

*Document Version: 1.0*
*Last Updated: 2026-02-10*
*Based on Lightdash codebase analysis as of commit ffe1bee*
