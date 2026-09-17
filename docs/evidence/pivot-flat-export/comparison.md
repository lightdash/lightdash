# Flat pivot export: before and after

These are actual XLSX files downloaded from the local Lightdash API using the seeded, synthetic Jaffle Shop data. They contain no customer data.

- [Download before.xlsx](./before.xlsx)
- [Download after.xlsx](./after.xlsx)
- [Source query and pivot configuration](./query.json)

## Compare the files

The source table has one pivoted row and two month columns:

| Status    | January 2024 | February 2024 | Total |
| --------- | -----------: | ------------: | ----: |
| completed |        25.50 |         10.00 | 35.50 |

Both exports use XLSX, Flat layout, Table rows scope, formatted values, and column totals. The column labels are Status, Month, and Revenue.

| File        |                Data rows | Revenue in data rows | Exported Total |
| ----------- | -----------------------: | -------------------: | -------------: |
| before.xlsx |         1 (January only) |                25.50 |          35.50 |
| after.xlsx  | 2 (January and February) |                35.50 |          35.50 |

The fix restores the missing February row with Revenue 10.00. The Total remains 35.50.

## Reproduction and provenance

Captured on 2026-09-17. This is an API replay of the dashboard export flow, not a browser recording:

1. Execute `query.json` with `POST /api/v2/projects/{projectUuid}/query/metric-query` against the seeded Jaffle Shop project. Poll the returned query UUID until ready. It returns one wide row containing both months.
2. **Before:** replay the original dashboard download hook's selection: execute the same query without `pivotConfiguration`, setting `query.limit` to the displayed pivot row count, **1**. Export that query using the baseline backend export implementation from commit `85bd08bf40b960abb271ddac15071335153f01ad`.
3. **After:** export the original pivoted query UUID using the fixed implementation. Do not execute a replacement flat query or apply the pivoted row count to flat rows.
4. In each case, call `POST /api/v2/projects/{projectUuid}/query/{queryUuid}/download` with the options below, then download the returned file URL using the authenticated demo session. The attachment name is `before` or `after` respectively. Both responses reported `truncated: false`.
5. Read both downloaded workbooks back with ExcelJS and compare the cells shown above. Files are the downloaded bytes, not manually constructed spreadsheets.

```json
{
  "type": "xlsx",
  "onlyRaw": false,
  "columnOrder": [
    "orders_status",
    "orders_order_date_month",
    "orders_total_order_amount"
  ],
  "customLabels": {
    "orders_status": "Status",
    "orders_order_date_month": "Month",
    "orders_total_order_amount": "Revenue"
  },
  "showTableNames": false,
  "exportPivotedData": false,
  "showColumnTotals": true
}
```
