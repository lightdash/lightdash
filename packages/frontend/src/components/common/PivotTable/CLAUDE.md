# Pivot Table Data Structure

This document explains the `PivotData` structure used by the PivotTable component.

## Overview

When a table is pivoted, dimensions move from rows to columns, creating a matrix view. The `PivotData` type contains all the information needed to render this transformation.

---

## Normal Table vs Pivoted Table

### Source Data (Unpivoted)

Imagine query results with:

-   **Dimensions**: `order_date_month`, `shipping_method`
-   **Metrics**: `total_order_amount`, `total_completed_order_amount`

```
| order_date_month | shipping_method | total_order_amount | total_completed_order_amount |
|------------------|-----------------|--------------------|-----------------------------|
| 2025-01          | standard        | $461.85            | $160.00                     |
| 2025-01          | express         | $320.39            | $160.50                     |
| 2025-01          | overnight       | $353.53            | $196.50                     |
| 2024-06          | standard        | $410.80            | $227.50                     |
| 2024-06          | express         | $274.40            | $150.00                     |
| 2024-06          | overnight       | $157.90            | $90.50                      |
```

### Pivoted Table (metricsAsRows: true)

Pivot dimensions: `order_date_month`, `shipping_method`

```
|                              | 2025-01/standard | 2025-01/express | 2025-01/overnight | 2024-06/standard | 2024-06/express | 2024-06/overnight |
|------------------------------|------------------|-----------------|-------------------|------------------|-----------------|-------------------|
| Total order amount           | $461.85          | $320.39         | $353.53           | $410.80          | $274.40         | $157.90           |
| Total completed order amount | $160.00          | $160.50         | $196.50           | $227.50          | $150.00         | $90.50            |
```

### Pivoted Table (metricsAsRows: false)

Same pivot, but metrics stay as columns:

```
|                  | 2025-01/standard |                   | 2025-01/express |                   | ... |
|                  | total_order_amt  | total_completed   | total_order_amt | total_completed   | ... |
|------------------|------------------|-------------------|-----------------|-------------------|-----|
| (single row)     | $461.85          | $160.00           | $320.39         | $160.50           | ... |
```

---

## PivotData Structure

### Core Fields

#### `titleFields`

2D array of header labels for the index/row area.

```json
{
    "titleFields": [
        [{ "fieldId": "orders_order_date_month", "direction": "header" }],
        [{ "fieldId": "orders_shipping_method", "direction": "header" }]
    ]
}
```

**Visual mapping:**

```
              ↓ titleFields[0] = "Order Date Month" (header row 0)
              ↓ titleFields[1] = "Shipping Method"  (header row 1)
|------------|-----------------|-----------------|
|            | 2025-01         | 2024-06         |  ← headerValues[0]
|            | standard|express| standard|express|  ← headerValues[1]
|------------|-----------------|-----------------|
| Metric A   |                 |                 |
| Metric B   |                 |                 |
```

#### `headerValueTypes`

Array describing each dimension used in the column headers.

```json
{
    "headerValueTypes": [
        { "type": "dimension", "fieldId": "orders_order_date_month" },
        { "type": "dimension", "fieldId": "orders_shipping_method" }
    ]
}
```

#### `headerValues`

2D array representing the pivoted column headers. Each row corresponds to one pivot dimension level.

```json
{
    "headerValues": [
        // Row 0: Month values
        [
            {
                "type": "value",
                "fieldId": "orders_order_date_month",
                "value": {
                    "raw": "2025-01-01T00:00:00Z",
                    "formatted": "2025-01"
                },
                "colSpan": 3
            },
            {
                "type": "value",
                "fieldId": "orders_order_date_month",
                "value": {
                    "raw": "2024-06-01T00:00:00Z",
                    "formatted": "2024-06"
                },
                "colSpan": 3
            }
        ],
        // Row 1: Shipping method values
        [
            {
                "type": "value",
                "fieldId": "orders_shipping_method",
                "value": { "raw": "standard", "formatted": "standard" },
                "colSpan": 1
            },
            {
                "type": "value",
                "fieldId": "orders_shipping_method",
                "value": { "raw": "express", "formatted": "express" },
                "colSpan": 1
            }
            // ... etc
        ]
    ]
}
```

**Key properties:**

-   `type`: `"value"` for actual values, `"label"` for field name labels
-   `colSpan`: How many columns this header cell spans (0 = hidden/merged)
-   `value`: The actual dimension value

#### `indexValueTypes`

Describes what appears in the row index (left side of table).

```json
{
    "indexValueTypes": [
        { "type": "metric" } // When metricsAsRows: true, metrics become row labels
    ]
}
```

Can also be `type: dimension` when dimensions remain as rows.

#### `indexValues`

2D array of row labels. Each sub-array represents one row's index cells.

```json
{
    "indexValues": [
        [{ "type": "label", "fieldId": "orders_total_order_amount" }],
        [{ "type": "label", "fieldId": "orders_total_completed_order_amount" }]
    ]
}
```

This means:

-   Row 0 shows "Total order amount"
-   Row 1 shows "Total completed order amount"

#### `dataValues`

2D array of actual cell values. `dataValues[rowIndex][colIndex]` gives the value.

```json
{
    "dataValues": [
        // Row 0 (total_order_amount)
        [
            { "raw": 461.85, "formatted": "$461.85" }, // 2025-01/standard
            { "raw": 320.39, "formatted": "$320.39" }, // 2025-01/express
            { "raw": 353.53, "formatted": "$353.53" } // 2025-01/overnight
            // ... 27 more columns
        ],
        // Row 1 (total_completed_order_amount)
        [
            { "raw": 160, "formatted": "$160.00" },
            { "raw": 160.5, "formatted": "$160.50" },
            { "raw": 196.5, "formatted": "$196.50" }
            // ...
        ]
    ]
}
```

#### `dataColumnCount` / `rowsCount` / `cellsCount`

Simple counts:

-   `dataColumnCount`: Number of data columns (30)
-   `rowsCount`: Number of data rows (2)
-   `cellsCount`: Total columns including label column (31)

---

### `pivotConfig`

Configuration that produced this pivot:

```json
{
    "pivotConfig": {
        "pivotDimensions": [
            "orders_order_date_month",
            "orders_shipping_method"
        ],
        "metricsAsRows": true,
        "columnOrder": [
            "orders_order_date_month",
            "orders_shipping_method",
            "orders_total_order_amount",
            "orders_total_completed_order_amount"
        ],
        "hiddenMetricFieldIds": [],
        "columnTotals": false,
        "rowTotals": false
    }
}
```

---

### `retrofitData`

Data reformatted for the TanStack Table library.

#### `pivotColumnInfo`

Metadata for each column:

```json
{
    "pivotColumnInfo": [
        { "fieldId": "label-0", "columnType": "label" },
        {
            "fieldId": "orders_order_date_month__orders_shipping_method__0",
            "baseId": "orders_shipping_method"
        },
        {
            "fieldId": "orders_order_date_month__orders_shipping_method__1",
            "baseId": "orders_shipping_method"
        }
        // ... etc
    ]
}
```

**Note:** When `metricsAsRows: true`, the `baseId` is the last pivot dimension (not the metric).

#### `allCombinedData`

Array of row objects ready for the table:

```json
{
    "allCombinedData": [
        // Row 0
        {
            "label-0": {
                "value": {
                    "raw": "Total order amount",
                    "formatted": "Total order amount"
                }
            },
            "orders_order_date_month__orders_shipping_method__0": {
                "value": { "raw": 1, "formatted": "$1.00" }
            },
            "orders_order_date_month__orders_shipping_method__1": {
                "value": { "raw": 27, "formatted": "$27.00" }
            }
            // ... all 30 columns
        },
        // Row 1
        {
            "label-0": {
                "value": {
                    "raw": "Total completed order amount",
                    "formatted": "..."
                }
            }
            // ... all columns
        }
    ]
}
```

---

## How Data Flows

### 1. Query Results → PivotData

[`packages/common/src/pivot/pivotQueryResults.ts`](packages/common/src/pivot/pivotQueryResults.ts)

```
Original rows (6 rows, 4 columns)
         ↓
    pivotQueryResults()
         ↓
PivotData (2 rows, 30+ columns)
```

### 2. PivotData → Table Columns

[`packages/frontend/src/components/common/PivotTable/index.tsx#L183-L272`](/packages/frontend/src/components/common/PivotTable/index.tsx#L183-L272)

```typescript
const columns = data.retrofitData.pivotColumnInfo.map((col, colIndex) => {
    const itemId = col.underlyingId || col.baseId || col.fieldId;
    const item = getField(itemId);

    return columnHelper.accessor((row) => row[col.fieldId], {
        id: col.fieldId,
        meta: {
            item: item, // Field metadata for formatting
            type: col.columnType, // 'label', 'indexValue', etc.
            headerInfo: headerInfoForColumns[colIndex], // Pivot context
        },
    });
});
```

### 3. Conditional Formatting Lookup

[`packages/frontend/src/components/common/PivotTable/index.tsx#L465-L489`](packages/frontend/src/components/common/PivotTable/index.tsx#L465-L489)

For each cell, `rowFields` is built to enable "compare to another field":

```typescript
// Current cell's pivot context (e.g., 2025-01/standard)
const currentHeaderInfo = cell.column.columnDef.meta?.headerInfo;

// Build rowFields from cells with SAME pivot context
const rowFieldsForCell = row
    .getVisibleCells()
    .filter((c) =>
        isEqual(c.column.columnDef.meta?.headerInfo, currentHeaderInfo),
    )
    .reduce((acc, c) => {
        acc[getItemId(cellMeta.item)] = {
            field: cellMeta.item,
            value: cellValue?.value?.raw,
        };
        return acc;
    }, {});
```

---

## Visual Mapping: Data Structure → Rendered Table

```
                    headerValues[0] (months)
                    ├─────────────────────────────────────────┤
                    headerValues[1] (shipping methods)
                    ├───────────┬───────────┬────────────────┤
                    │           │           │                │
┌───────────────────┼───────────┼───────────┼────────────────┤
│ titleFields[0]    │  2025-01  │  2025-01  │    2024-06     │  ← Header row 0
├───────────────────┼───────────┼───────────┼────────────────┤
│ titleFields[1]    │ standard  │  express  │   standard     │  ← Header row 1
├───────────────────┼───────────┼───────────┼────────────────┤
│ indexValues[0]    │ $461.85   │ $320.39   │   $410.80      │  ← dataValues[0][...]
│ (Total order amt) │           │           │                │
├───────────────────┼───────────┼───────────┼────────────────┤
│ indexValues[1]    │ $160.00   │ $160.50   │   $227.50      │  ← dataValues[1][...]
│ (Total completed) │           │           │                │
└───────────────────┴───────────┴───────────┴────────────────┘

                    └─── retrofitData.allCombinedData[row][col] ───┘
```

---

## Summary Table

| Field              | Purpose                     | Example                                             |
| ------------------ | --------------------------- | --------------------------------------------------- |
| `titleFields`      | Labels in header's row area | `["Order Date Month", "Shipping Method"]`           |
| `headerValueTypes` | Pivot dimension metadata    | `[{type: 'dimension', fieldId: '...'}]`             |
| `headerValues`     | Actual pivot column headers | `[["2025-01", "2024-06"], ["standard", "express"]]` |
| `indexValueTypes`  | Row index type              | `[{type: 'metric'}]`                                |
| `indexValues`      | Row labels                  | `[["Total order amount"], ["Total completed..."]]`  |
| `dataValues`       | Cell values                 | `[[461.85, 320.39], [160, 160.5]]`                  |
| `pivotConfig`      | Pivot settings              | `{metricsAsRows: true, pivotDimensions: [...]}`     |
| `retrofitData`     | TanStack-ready format       | `{allCombinedData: [...], pivotColumnInfo: [...]}`  |

---

## The `pivotQueryResults` Algorithm

**Location:** `packages/common/src/pivot/pivotQueryResults.ts`

### Input

```typescript
{
  pivotConfig: PivotConfig;
  metricQuery: { dimensions, metrics, tableCalculations, ... };
  rows: ResultRow[];
  groupedSubtotals?: Record<string, Record<string, number>[]>;
  options: { maxColumns: number };
  getField: (fieldId: string) => ItemsMap[string];
  getFieldLabel: (fieldId: string) => string;
}
```

### Algorithm Steps

#### Step 1: Separate Dimensions

```typescript
// Header dimensions = pivoted (become columns)
const headerDimensions = pivotConfig.pivotDimensions.filter((d) =>
    dimensions.includes(d),
);

// Index dimensions = non-pivoted (stay as rows)
const indexDimensions = dimensions.filter(
    (d) => !pivotConfig.pivotDimensions.includes(d),
);
```

#### Step 2: Build Nested Indices

Uses recursive `RecursiveRecord<number>` to map dimension value combinations → array position.

```typescript
// Example: rowIndices for metricsAsRows=true
{
  "dim1_value_A": {
    "metric_1": 0,  // row position
    "metric_2": 1
  },
  "dim1_value_B": {
    "metric_1": 2,
    "metric_2": 3
  }
}
```

Key helper functions:

-   `setIndexByKey(obj, keys, value)`: Creates nested path, returns `true` if new
-   `getIndexByKey(obj, keys)`: Retrieves position from nested path

#### Step 3: First Pass - Collect Unique Rows/Columns

```typescript
for (let nRow = 0; nRow < N_ROWS; nRow++) {
    for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
        // Build index key: [dim1_value, dim2_value, ...metric_id?]
        const indexRowValues = indexDimensions
            .map((d) => row[d].value)
            .concat(pivotConfig.metricsAsRows ? [metric.fieldId] : []);

        // Build header key: [pivot_dim1_value, ...metric_id?]
        const headerRowValues = headerDimensions
            .map((d) => row[d].value)
            .concat(pivotConfig.metricsAsRows ? [] : [metric.fieldId]);

        // Track unique combinations
        if (setIndexByKey(rowIndices, indexKeys, rowCount)) {
            rowCount++;
            indexValues.push(indexRowValues);
        }
        if (setIndexByKey(columnIndices, headerKeys, columnCount)) {
            columnCount++;
            headerValuesT.push(headerRowValues);
        }
    }
}
```

#### Step 4: Second Pass - Populate Data Values

```typescript
const dataValues = create2DArray(N_DATA_ROWS, N_DATA_COLUMNS);

for (let nRow = 0; nRow < N_ROWS; nRow++) {
    for (let nMetric = 0; nMetric < metrics.length; nMetric++) {
        const rowIndex = getIndexByKey(rowIndices, rowKeys);
        const columnIndex = getIndexByKey(columnIndices, columnKeys);
        dataValues[rowIndex][columnIndex] = row[metric.fieldId].value;
    }
}
```

#### Step 5: Calculate Totals

Row totals: Sum across columns for each row
Column totals: Sum down rows for each column

---

## How `retrofitData` is Created

**Function:** `combinedRetrofit()` in `pivotQueryResults.ts:224-377`

Converts structured `PivotData` back to flat `ResultRow[]` for TanStack Table.

### Field ID Generation

```typescript
// Combines all header dimension fieldIds
uniqueIdsForDataValueColumns[
    colIndex
] = `${header1.fieldId}__${header2.fieldId}__${colIndex}`;
// Example: "orders_order_date_month__orders_shipping_method__0"
```

### Row Transformation

```typescript
const allCombinedData = indexValues.map((row, rowIndex) => {
    const newRow = row.map((cell, colIndex) => {
        if (cell.type === 'label') {
            return {
                fieldId: `label-${colIndex}`,
                value: getFieldLabel(cell.fieldId),
                columnType: 'label',
            };
        }
        return { ...cell, columnType: 'indexValue' };
    });

    const remappedDataValues = dataValues[rowIndex].map(
        (dataValue, colIndex) => ({
            baseId: lastHeaderRow[colIndex]?.fieldId, // ⚠️ Last pivot dimension, not metric!
            fieldId: uniqueIdsForDataValueColumns[colIndex] + colIndex,
            value: dataValue,
        }),
    );

    return [...newRow, ...remappedDataValues, ...remappedRowTotals];
});
```

---

## Subtotals System

### Data Structure

```typescript
groupedSubtotals: Record<string, Record<string, number>[]>;
// Key: comma-separated dimension IDs being grouped
// Value: array of subtotal records
```

Example:

```typescript
{
  "orders_customer,orders_region": [
    { "orders_customer": "Alice", "orders_region": "US", "orders_total_revenue": 5000, "orders_count": 10 },
    { "orders_customer": "Bob", "orders_region": "EU", "orders_total_revenue": 3000, "orders_count": 5 }
  ]
}
```

### API Flow

1. **Frontend hook:** `useCalculateSubtotals()` (`packages/frontend/src/hooks/useCalculateSubtotals.ts`)
2. **API call:** `POST /projects/{uuid}/calculate-subtotals`
3. **Passed to:** `pivotQueryResults({ groupedSubtotals })`
4. **Stored in:** `PivotData.groupedSubtotals`

### Lookup in PivotTable

```typescript
// In aggregatedCell callback (when row is grouped)
const { groupingValues, subtotalGroupKey } =
    getGroupingValuesAndSubtotalKey(info);

const subtotal = data.groupedSubtotals?.[subtotalGroupKey]?.find((sub) => {
    // Match all grouping dimension values
    return (
        Object.keys(groupingValues).every(
            (key) => groupingValues[key]?.value.raw === sub[key],
        ) &&
        // Match all pivoted header values for this column
        Object.keys(pivotedHeaderValues).every(
            (key) => pivotedHeaderValues[key]?.raw === sub[key],
        )
    );
});
```

### Subtotal Key Generation

```typescript
// packages/common: getSubtotalKey()
const subtotalGroupKey = getSubtotalKey(groupingDimensions);
// e.g., "orders_customer,orders_region"
```

---

## File Locations

| File                                                                   | Purpose                        |
| ---------------------------------------------------------------------- | ------------------------------ |
| `packages/common/src/types/pivot.ts`                                   | Type definitions               |
| `packages/common/src/pivot/pivotQueryResults.ts`                       | Core transformation logic      |
| `packages/common/src/pivot/pivotConfig.ts`                             | Config helpers                 |
| `packages/frontend/src/components/common/PivotTable/index.tsx`         | React component                |
| `packages/frontend/src/hooks/tableVisualization/useTableConfig.ts`     | State management, worker calls |
| `packages/frontend/src/hooks/useCalculateSubtotals.ts`                 | Subtotals API hook             |
| `packages/frontend/src/hooks/tableVisualization/getDataAndColumns.tsx` | Subtotal lookup helpers        |
