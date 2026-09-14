---
name: table-calculations
description: Author formula table calculations for run_metric_query, including ratios, aggregate comparisons, windows and rankings.
availability:
    - mcp
---

# Table calculations

For `run_metric_query`, author `queryConfig.tableCalculations` as type `formula`. The input schema documents the syntax and required fields; use spreadsheet-like formulas, not raw SQL.

Calculations operate on query results after aggregation. Reference selected field IDs or other table calculation names. The names below are placeholders: replace them with the actual fields or calculations in your query. Do not add grouping dimensions unless the user requested that grain.

## When to use them

- Arithmetic across metrics: `metric_a + metric_b`, ratios `metric_a / metric_b`.
- Aggregating already-aggregated metrics (e.g., average of monthly totals): `AVG(metric)`.
- Percent of total: `m / SUM(m)`.
- Period-over-period: `(m - LAG(m, ORDER BY date)) / LAG(m, ORDER BY date)`.
- Rankings: `RANK(ORDER BY m DESC)`.
- Running totals: `RUNNING_TOTAL(m, ORDER BY date)`.
- Trailing 3-period average: `MOVING_AVG(m, 2, ORDER BY date)`. The second argument counts preceding rows; the current row is also included.
- Top N per group: `ROW_NUMBER(PARTITION BY group, ORDER BY m DESC)`, then filter on that calculation.

Use the schema's formatting options for ratios and percentage changes; do not multiply a fraction by 100 when using percent formatting.
