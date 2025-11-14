# QueryBuilder

The QueryBuilder module provides SQL generation and transformation utilities for Lightdash queries. It handles metric queries, pivot transformations, SQL chart queries, and parameter replacement while supporting multiple warehouse dialects and complex filtering logic.

## How to use

The module contains three main query builders that work together:

1. **MetricQueryBuilder** - Builds queries for metrics/dimensions with joins and aggregations
2. **PivotQueryBuilder** - Transforms flat queries into pivot tables with row/column metadata
3. **SqlQueryBuilder** - Builds queries for SQL charts with filtering and parameter support

Entry points:

```typescript
import { MetricQueryBuilder } from './MetricQueryBuilder';
import { PivotQueryBuilder } from './PivotQueryBuilder';
import { SqlQueryBuilder } from './SqlQueryBuilder';
import { safeReplaceParametersWithSqlBuilder } from './parameters';

// Build a metric query
const metricBuilder = new MetricQueryBuilder({
    explore,
    metricQuery,
    warehouseSqlBuilder,
    userAttributes,
    intrinsicUserAttributes,
    parameters,
    timezone,
});
const { query, fields } = metricBuilder.buildQuery();

// Transform to pivot table
const pivotBuilder = new PivotQueryBuilder(
    query,
    pivotConfiguration,
    warehouseSqlBuilder,
    limit,
);
const pivotSql = pivotBuilder.toSql();

// Build SQL chart query
const sqlBuilder = new SqlQueryBuilder(
    {
        referenceMap,
        select: ['date', 'revenue'],
        from: { name: 'sales', sql: userSql },
        filters,
        parameters,
        limit,
    },
    warehouseConfig,
);
const { sql, parameterReferences } = sqlBuilder.getSqlAndReferences();
```

## Code Example

Complete example with pivot transformation:

```typescript
// 1. Build the base metric query
const metricQuery = {
    exploreName: 'sales',
    dimensions: ['date', 'category'],
    metrics: ['revenue'],
    filters: { ... },
    limit: 500
};

const metricBuilder = new MetricQueryBuilder({
    explore,
    metricQuery,
    warehouseSqlBuilder,
    parameters: { start_date: '2024-01-01' }
});
const { query: baseSql } = metricBuilder.buildQuery();

// 2. Apply pivot transformation
const pivotConfig = {
    indexColumn: [{ reference: 'date' }],         // Rows
    valuesColumns: [                              // Values
        { reference: 'revenue', aggregation: 'sum' }
    ],
    groupByColumns: [{ reference: 'category' }],  // Columns to pivot
    sortBy: [{ reference: 'date', direction: 'ASC' }]
};

const pivotBuilder = new PivotQueryBuilder(
    baseSql,
    pivotConfig,
    warehouseSqlBuilder,
    500
);
const pivotSql = pivotBuilder.toSql({
    columnLimit: lightdashConfig.pivotTable.maxColumnLimit  // From LIGHTDASH_PIVOT_TABLE_MAX_COLUMN_LIMIT env var (default: 100)
});

// 3. Execute and transform results (in AsyncQueryService)
const { columns, pivotDetails } = await AsyncQueryService.runQueryAndTransformRows({
    warehouseClient,
    query: pivotSql,
    pivotConfiguration: pivotConfig,
    itemsMap: fields,
    write: (rows) => {
        // Rows written with pivot structure using row_index
    }
});
```

Parameter replacement example:

```typescript
const sqlWithParams = 'SELECT * FROM orders WHERE date > {{start_date}}';
const { replacedSql, usedParameters } = safeReplaceParametersWithSqlBuilder(
    sqlWithParams,
    { start_date: '2024-01-01' },
    warehouseClient,
);
// Result: SELECT * FROM orders WHERE date > '2024-01-01'
```

## Important to know

**Pivot Transformation Two-Phase Process:**

**Phase 1 - SQL Generation (PivotQueryBuilder):**

-   PivotQueryBuilder does NOT pivot the actual data
-   It generates SQL that adds `row_index` and `column_index` metadata using DENSE_RANK() window functions
-   The SQL structure uses CTEs: original_query → group_by_query → pivot_query → filtered_rows
-   Each result row contains the original data PLUS row_index and column_index fields
-   These indexes identify where each value belongs in the final pivot table

**Phase 2 - Result Transformation (runQueryAndTransformRows):**

-   AsyncQueryService.runQueryAndTransformRows streams results from the warehouse
-   As rows arrive, it uses `row_index` to group related data together
-   When `row_index` changes, the previous row is complete and gets written
-   The transformation builds pivot columns dynamically using the pattern: `{field}_{aggregation}_{groupByValue}`
-   Example: `revenue_sum_electronics` for revenue sum in electronics category

**Key Technical Details:**

-   **MetricQueryBuilder** handles complex joins, window functions, and warehouse-specific SQL generation
-   Pivot column limit is configurable via `LIGHTDASH_PIVOT_TABLE_MAX_COLUMN_LIMIT` (default: 100)
    -   When set, the limit is passed to `PivotQueryBuilder.toSql({ columnLimit })`
    -   If `columnLimit` is provided, SQL adds `column_index <= maxColumnsPerValueColumn` filter
    -   If `columnLimit` is undefined, no column filtering is applied (unlimited columns)
-   Pivot results are streamed and transformed during processing, not after loading all data
-   Parameter replacement supports both safe (typed) and raw replacement modes
-   The module supports multiple warehouse dialects (BigQuery, Snowflake, Postgres, etc.)
-   User attributes and intrinsic attributes are replaced before query execution
-   CTEs are used extensively for query composition and debugging
-   Filter groups support nested AND/OR logic with proper SQL generation

## Links

Related files:

-   @/packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts - Query execution and result processing
-   @/packages/backend/src/utils/QueryBuilder/utils.ts - SQL parsing and manipulation utilities
-   @/packages/backend/src/utils/QueryBuilder/parameters.ts - Parameter replacement logic
-   @/packages/warehouses/src/warehouseSqlBuilder.ts - Warehouse-specific SQL builders
-   @/packages/common/src/types/pivot.ts - Pivot configuration types
