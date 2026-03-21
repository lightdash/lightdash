import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    OTHER_GROUP_SENTINEL_VALUE,
    ParameterError,
    SortByDirection,
    SupportedDbtAdapter,
    TableCalculationType,
    TimeFrames,
    VizAggregationOptions,
    VizIndexType,
    WeekDay,
    type CompiledDimension,
    type CustomBinDimension,
    type ItemsMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { type PivotSourceContract } from './MetricQueryBuilder';
import { PivotQueryBuilder } from './PivotQueryBuilder';

// Mock warehouse SQL builder
const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getFloatingType: () => 'DOUBLE PRECISION',
    getStartOfWeek: () => WeekDay.MONDAY,
} as unknown as WarehouseSqlBuilder;

const replaceWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim();

describe('PivotQueryBuilder', () => {
    const baseSql = 'SELECT * FROM events';

    describe('Simple aggregation without group by columns', () => {
        test('Should build simple pivot query with index and values columns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();

            expect(replaceWhitespace(result)).toContain(
                'WITH original_query AS (SELECT * FROM events), group_by_query AS (SELECT "date", sum("event_id") AS "event_id_sum" FROM original_query group by "date")',
            );
            expect(result).toContain('ORDER BY "date" ASC');
            expect(result).toContain('LIMIT 500');
        });

        test('Should build query with multiple index columns', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'event', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            expect(replaceWhitespace(result)).toContain(
                '"date", "event", count("event_id") AS "event_id_count" FROM original_query group by "date", "event"',
            );
        });

        test('Should build query with multiple values columns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'user_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            expect(result).toContain('sum("event_id") AS "event_id_sum"');
            expect(result).toContain('count("user_id") AS "user_id_count"');
            expect(result).toContain('avg("revenue") AS "revenue_avg"');
        });
    });

    describe('Full pivot query with group by columns', () => {
        test('Should build complex pivot query with metadata', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                100,
            );

            const result = builder.toSql({ columnLimit: 100 });

            // Should contain all CTEs
            expect(result).toContain(
                'WITH original_query AS (SELECT * FROM events)',
            );
            expect(result).toContain('group_by_query AS (');
            expect(result).toContain('pivot_query AS (');
            expect(result).toContain('filtered_rows AS (');
            expect(result).toContain('total_columns AS (');

            // Should include row_index and column_index metadata
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" asc) as "row_index"',
            );
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."event_type" asc) as "column_index"',
            );

            // Should apply limits and column constraints
            expect(result).toContain('WHERE "row_index" <= 100');
            expect(result).toContain('"column_index" <= 100');

            // Should join with total_columns for metadata
            expect(result).toContain('CROSS JOIN total_columns t');
            expect(result).toContain('t.total_columns');
        });

        test('Should handle multiple group by columns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'event_type' },
                    { reference: 'platform' },
                ],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            expect(result).toContain('"event_type", "platform", "date"');
            expect(result).toContain(
                'group by "event_type", "platform", "date"',
            );
        });

        test('Should handle multiple values columns with column limit calculation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'user_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql({ columnLimit: 100 });

            // With 3 value columns: 100/3 = 33 max columns per value column
            expect(result).toContain('"column_index" <= 33');
        });

        test('Should not apply column limit when columnLimit is not provided', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                100,
            );

            const result = builder.toSql(); // No columnLimit provided

            // Should NOT contain column_index filtering
            expect(result).not.toContain('"column_index" <=');
            // Should still contain row_index filtering
            expect(result).toContain('"row_index" <= 100');
        });

        test('Should use full column limit when metricsAsRows is true', () => {
            // When metricsAsRows is true, metrics become rows instead of columns,
            // so we don't divide the column limit by the number of value columns
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'user_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
                metricsAsRows: true, // Metrics are rows, not columns
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql({ columnLimit: 100 });

            // With metricsAsRows=true, should use full column limit (100)
            // Without metricsAsRows, it would be 100/3 = 33
            expect(result).toContain('"column_index" <= 100');
        });

        test('Should divide column limit by value columns when metricsAsRows is false or undefined', () => {
            // When metricsAsRows is false/undefined, metrics become columns,
            // so we divide the column limit by the number of value columns
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'user_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
                metricsAsRows: false, // Metrics are columns (default behavior)
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql({ columnLimit: 100 });

            // With 3 value columns: 100/3 = 33 max columns per value column
            expect(result).toContain('"column_index" <= 33');
        });
    });

    describe('Sorting strategies', () => {
        // Two sorting strategies exist based on what column is being sorted:
        //
        // 1. Dimension sort (lexicographic): When sorting by an index or groupBy column,
        //    rows are ordered directly by the dimension value. No extra CTEs needed.
        //
        // 2. Metric sort (anchor-based): When sorting by a value/metric column, we need
        //    to determine what metric value represents each row/column. The metric value
        //    used for sorting comes from the "first" pivot column (column_index = 1),
        //    not MIN/MAX across all columns.

        test('Dimension sort: should NOT create column_ranking or anchor_column CTEs when sorting by index column', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Dimension sort: row_index should use the dimension value directly
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" desc) as "row_index"',
            );

            // Should NOT create column_ranking or anchor_column CTEs
            // (these are only needed for metric-based sorting)
            expect(result).not.toContain('column_ranking AS (');
            expect(result).not.toContain('anchor_column AS (');

            // Should NOT create row anchor CTEs for revenue
            expect(result).not.toContain('"revenue_row_anchor" AS (');
        });

        test('Dimension sort: should NOT create metric anchor CTEs when sorting by groupBy column', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'category', direction: SortByDirection.ASC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // GroupBy column sort: column_index should use the dimension value directly
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."category" asc) as "column_index"',
            );

            // Should NOT create column_ranking or anchor_column CTEs
            expect(result).not.toContain('column_ranking AS (');
            expect(result).not.toContain('anchor_column AS (');

            // Should NOT create metric anchor CTEs
            expect(result).not.toContain('"revenue_row_anchor" AS (');
            expect(result).not.toContain('"revenue_column_anchor" AS (');
        });

        test('Metric sort: should create column_ranking and anchor_column CTEs when sorting by value column', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Metric sort: should create column_ranking CTE to compute column_index per groupBy value
            expect(result).toContain('column_ranking AS (');
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_column_anchor"."revenue_column_anchor_value" DESC',
            );

            // Metric sort: should create anchor_column CTE to identify first pivot column (column_index = 1)
            // Uses alias (anchor_category) and ORDER BY + LIMIT 1 for deterministic selection
            expect(result).toContain('anchor_column AS (');
            expect(replaceWhitespace(result)).toContain(
                'SELECT cr."category" AS "anchor_category" FROM column_ranking cr WHERE "col_idx" = 1 ORDER BY cr."category" ASC LIMIT 1',
            );

            // Metric sort: row anchor should use CROSS JOIN with anchor_column
            // (gets metric value at first pivot column only, not MIN/MAX across all columns)
            expect(result).toContain('"revenue_row_anchor" AS (');
            expect(replaceWhitespace(result)).toContain(
                'MAX(CASE WHEN q."category" = ac."anchor_category" THEN q."revenue_sum" END)',
            );
            expect(result).toContain('CROSS JOIN anchor_column ac');
        });

        test('Should include anchor CTEs and joins when sorting by a value column in pivot queries', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should add additional CTEs for metric first values
            expect(result).toContain('"revenue_row_anchor" AS (');
            expect(result).toContain('"revenue_column_anchor" AS (');

            // row_ranking CTE should join with row_anchor and compute DENSE_RANK
            expect(result).toContain('row_ranking AS (');
            expect(replaceWhitespace(result)).toContain(
                'JOIN "revenue_row_anchor" ON g."date" = "revenue_row_anchor"."date"',
            );

            // column_ranking CTE should join with column_anchor and compute DENSE_RANK
            expect(replaceWhitespace(result)).toContain(
                'JOIN "revenue_column_anchor" ON g."category" = "revenue_column_anchor"."category"',
            );

            // Row index should be computed in row_ranking CTE (not in pivot_query)
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" DESC, g."date" ASC) AS "row_index"',
            );

            // Column index should be computed in column_ranking CTE (not in pivot_query)
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_column_anchor"."revenue_column_anchor_value" DESC, g."category" ASC) AS "col_idx"',
            );

            // pivot_query should JOIN with precomputed rankings
            expect(replaceWhitespace(result)).toContain(
                'LEFT JOIN row_ranking rr ON g."date" = rr."date"',
            );
            expect(replaceWhitespace(result)).toContain(
                'LEFT JOIN column_ranking cr ON g."category" = cr."category"',
            );
        });

        test('Should respect sort order mixing value and index columns for row_index', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'store_id', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.ASC },
                    { reference: 'store_id', direction: SortByDirection.DESC },
                    // date not specified -> should be appended ASC
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Row index order must follow: revenue anchor ASC, store_id DESC, then date ASC (appended)
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" ASC, g."store_id" DESC, g."date" ASC) AS "row_index"',
            );
        });

        test('Should include explicit frame clauses in FIRST_VALUE for Redshift compatibility', () => {
            // Redshift requires explicit frame clauses for aggregate window functions with ORDER BY
            // See: https://docs.aws.amazon.com/redshift/latest/dg/r_WF_first_value.html
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Column anchor CTEs should have explicit frame clauses (for Redshift compatibility)
            expect(result).toContain(
                'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
            );

            // Row anchor uses CROSS JOIN with anchor_column (cleaner than scalar subquery)
            // (gets value at first pivot column, not MIN/MAX across all columns)
            expect(replaceWhitespace(result)).toContain(
                'MAX(CASE WHEN q."category" = ac."anchor_category" THEN q."revenue_sum" END)',
            );
            expect(result).toContain('CROSS JOIN anchor_column ac');

            // Verify the complete FIRST_VALUE syntax in column anchor
            expect(replaceWhitespace(result)).toContain(
                'FIRST_VALUE("revenue_sum") OVER (PARTITION BY "category" ORDER BY "revenue_sum" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );
        });

        test('Metric sort: should use precomputed row_ranking and column_ranking CTEs instead of inline Window functions', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // row_ranking CTE should compute row_index with DENSE_RANK in a self-contained CTE
            expect(result).toContain('row_ranking AS (');
            expect(replaceWhitespace(result)).toContain(
                'row_ranking AS (SELECT DISTINCT g."date", DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" DESC, g."date" ASC) AS "row_index" FROM group_by_query g LEFT JOIN "revenue_row_anchor" ON g."date" = "revenue_row_anchor"."date")',
            );

            // pivot_query should JOIN with precomputed rankings instead of computing Window functions
            expect(replaceWhitespace(result)).toContain(
                'pivot_query AS (SELECT g."date", g."category", g."revenue_sum", rr."row_index" AS "row_index", cr."col_idx" AS "column_index" FROM group_by_query g LEFT JOIN row_ranking rr ON g."date" = rr."date" LEFT JOIN column_ranking cr ON g."category" = cr."category")',
            );

            // pivot_query should NOT contain DENSE_RANK (rankings are precomputed)
            const pivotQueryMatch = result.match(/pivot_query AS \(([^)]+)\)/);
            expect(pivotQueryMatch?.[1]).not.toContain('DENSE_RANK');
        });

        test('No metric sort: should NOT create row_ranking CTE when no anchor CTEs exist', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // No metric sort, so no precomputed rankings
            expect(result).not.toContain('row_ranking AS (');

            // pivot_query should compute rankings inline with DENSE_RANK
            expect(result).toContain('DENSE_RANK() OVER');

            // Downstream CTEs should reference pivot_query directly
            expect(result).toContain('FROM pivot_query WHERE "row_index"');
            expect(result).toContain('FROM pivot_query p CROSS JOIN');
        });
    });

    describe('Sort handling', () => {
        test('Should handle single sort ascending', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" ASC');
        });

        test('Should handle single sort descending', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" DESC');
        });

        test('Should handle multiple sorts', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'event', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    { reference: 'date', direction: SortByDirection.ASC },
                    { reference: 'event', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" ASC, "event" DESC');
        });

        test('Should use index column sort for row_index in pivot queries', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should use DESC for row_index calculation
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" desc) as "row_index"',
            );
        });
    });

    describe('Aggregation functions', () => {
        test('Should handle sum aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('sum("event_id") AS "event_id_sum"');
        });

        test('Should handle count aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('count("event_id") AS "event_id_count"');
        });

        test('Should handle avg aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('avg("event_id") AS "event_id_avg"');
        });

        test('Should handle min aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.MIN,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('min("event_id") AS "event_id_min"');
        });

        test('Should handle max aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.MAX,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('max("event_id") AS "event_id_max"');
        });

        test('Should handle any aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            // PostgreSQL uses ARRAY_AGG for ANY aggregation
            expect(result).toContain(
                '(ARRAY_AGG("event_id"))[1] AS "event_id_any"',
            );
        });
    });

    describe('SQL sanitization', () => {
        test('Should remove trailing semicolon from input SQL', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                'SELECT * FROM events;',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain(
                'original_query AS (SELECT * FROM events)',
            );
            expect(result).not.toContain('events;');
        });

        test('Should handle SQL with multiple trailing semicolons and whitespace', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                'SELECT * FROM events;; \n\t;',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            // The regex should remove trailing semicolons and whitespace but it seems to keep some
            expect(result).toContain('SELECT * FROM events');
        });

        test('Should remove comments and limits from base SQL in original_query CTE', () => {
            const sqlWithCommentsAndLimit = `
                -- leading comment with LIMIT 999
                SELECT * FROM events /* inline block comment */ WHERE id > 1
                -- another comment
                LIMIT 123; /* end comment */
            `;

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                sqlWithCommentsAndLimit,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                50,
            );

            const result = builder.toSql();

            // base sql doesn't contain comments or limits
            expect(result)
                .toBe(`WITH original_query AS (SELECT * FROM events WHERE id > 1),
group_by_query AS (SELECT "date", sum("event_id") AS "event_id_sum" FROM original_query group by "date")
SELECT * FROM group_by_query LIMIT 50`);
        });
    });

    describe('Limit handling', () => {
        test('Should use default limit of 500 when no limit specified', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('LIMIT 500');
        });

        test('Should use specified limit', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                1000,
            );

            const result = builder.toSql();
            expect(result).toContain('LIMIT 1000');
        });

        test('Should apply limit to filtered_rows in pivot queries', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                250,
            );

            const result = builder.toSql();
            expect(result).toContain('WHERE "row_index" <= 250');
        });
    });

    describe('Edge cases', () => {
        test('Should handle empty sort array', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).not.toContain('ORDER BY');
        });

        test('Should handle single index column as non-array', () => {
            const pivotConfiguration = {
                indexColumn: { reference: 'date', type: VizIndexType.TIME },
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('"date"');
        });

        test('Should throw error when index and group by columns overlap', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'date' }], // Same as index column
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            // Should throw an error since no index columns are provided
            expect(() => builder.toSql()).toThrow(ParameterError);
            expect(() => builder.toSql()).toThrow(
                'Group column(s) cannot also be part of the index column(s):',
            );
        });
    });

    describe('Pivoting without index columns', () => {
        test('Should support undefined indexColumn when groupBy columns are present', () => {
            const pivotConfiguration = {
                indexColumn: undefined,
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );
            const result = builder.toSql();

            // Should generate a full pivot query with a constant row_index (no index columns)
            expect(result).toContain('pivot_query AS (');
            expect(result).toContain('1 AS "row_index"');
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."event_type" asc) as "column_index"',
            );
        });

        test('Should support empty indexColumns array when groupBy columns are present', () => {
            const pivotConfiguration = {
                indexColumn: [],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );
            const result = builder.toSql();

            // Should generate a full pivot query with a constant row_index (no index columns)
            expect(result).toContain('pivot_query AS (');
            expect(result).toContain('1 AS "row_index"');
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."event_type" asc) as "column_index"',
            );
        });
    });

    describe('Warehouse type compatibility', () => {
        test('Should use correct quote characters for BigQuery', () => {
            const mockBigQueryBuilder = {
                getFieldQuoteChar: () => '`',
                getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
            } as unknown as WarehouseSqlBuilder;

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockBigQueryBuilder,
            );

            const result = builder.toSql();

            // Should use backticks for BigQuery
            expect(result).toContain('`date`');
            expect(result).toContain('sum(`event_id`) AS `event_id_sum`');
        });

        test('Should use correct quote characters for Databricks', () => {
            const mockDatabricksBuilder = {
                getFieldQuoteChar: () => '`',
                getAdapterType: () => SupportedDbtAdapter.DATABRICKS,
            } as unknown as WarehouseSqlBuilder;

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockDatabricksBuilder,
            );

            const result = builder.toSql();

            // Should use backticks for Databricks
            expect(result).toContain('`event_type`');
            expect(result).toContain('`row_index`');
            expect(result).toContain('`column_index`');
        });
    });

    describe('Multiple index columns', () => {
        test('Should handle multiple index columns correctly', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'store_id', type: VizIndexType.CATEGORY },
                    {
                        reference: 'product_category',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [
                    { reference: 'category' },
                    { reference: 'region' },
                ],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should include all index columns in GROUP BY
            expect(result).toContain('"date", "store_id", "product_category"');

            // Should include all index columns in the pivot query ORDER BY for row_index
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" asc, g."store_id" asc, g."product_category" asc)',
            );

            // Should include all columns in select references (all should be quoted now)
            expect(result).toContain(
                'g."date", g."store_id", g."product_category", g."category", g."region"',
            );
        });

        test('Should handle mixed sorting for multiple index columns', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'store_id', type: VizIndexType.CATEGORY },
                    {
                        reference: 'product_category',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                    { reference: 'store_id', direction: SortByDirection.ASC },
                    // product_category is not on the sort by so it will default to ASC
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should respect sort directions for specified columns only
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" desc, g."store_id" asc, g."product_category" asc)',
            );
        });
    });

    describe('Additional edge cases', () => {
        test('Should handle empty values columns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [],
                groupByColumns: [{ reference: 'category' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should still work with empty values columns
            expect(result).toContain(
                'SELECT "category", "date" FROM original_query group by "category", "date"',
            );
            // Should calculate total_columns correctly using subquery approach
            expect(result).toContain(
                'SELECT COUNT(*) AS total_columns FROM (SELECT DISTINCT "category" FROM filtered_rows) AS distinct_groups',
            );
        });

        test('Should handle undefined limit (defaults to 500)', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                undefined, // No limit provided
            );

            const result = builder.toSql();

            // Should default to 500
            expect(result).toContain('WHERE "row_index" <= 500');
        });

        test('Should remove duplicate columns from group by dimensions', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'category' },
                    { reference: 'category' }, // duplicate
                    { reference: 'region' },
                ],
                sortBy: undefined,
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should deduplicate in the group by clause
            // The Set() should handle this deduplication
            expect(result).toContain('group by "category", "region", "date"');
        });
    });

    describe('NULLS FIRST/LAST handling', () => {
        describe('getNullsFirstLast static method', () => {
            test('Should return empty string when nullsFirst is undefined', () => {
                expect(PivotQueryBuilder.getNullsFirstLast(undefined)).toBe('');
            });

            test('Should return NULLS FIRST when nullsFirst is true', () => {
                expect(PivotQueryBuilder.getNullsFirstLast(true)).toBe(
                    ' NULLS FIRST',
                );
            });

            test('Should return NULLS LAST when nullsFirst is false', () => {
                expect(PivotQueryBuilder.getNullsFirstLast(false)).toBe(
                    ' NULLS LAST',
                );
            });
        });

        test('Should include NULLS FIRST in simple query ORDER BY', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'date',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" ASC NULLS FIRST');
        });

        test('Should include NULLS LAST in simple query ORDER BY', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'date',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" DESC NULLS LAST');
        });

        test('Should include NULLS FIRST in pivot query row_index DENSE_RANK', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    {
                        reference: 'date',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."date" asc nulls first) as "row_index"',
            );
        });

        test('Should include NULLS LAST in pivot query column_index DENSE_RANK', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    {
                        reference: 'event_type',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."event_type" desc nulls last) as "column_index"',
            );
        });

        test('Should include NULLS clause in value column anchor CTEs', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'revenue',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Row anchor uses CROSS JOIN with anchor_column (cleaner than scalar subquery)
            // The NULLS LAST is applied in the row_index ORDER BY, not the anchor CTE
            expect(replaceWhitespace(result)).toContain(
                'MAX(CASE WHEN q."category" = ac."anchor_category" THEN q."revenue_sum" END)',
            );
            expect(result).toContain('CROSS JOIN anchor_column ac');

            // Check that row_index ORDER BY has NULLS LAST
            expect(replaceWhitespace(result)).toContain(
                '"revenue_row_anchor"."revenue_row_anchor_value" DESC NULLS LAST',
            );

            // Check column anchor CTE has NULLS LAST
            expect(replaceWhitespace(result)).toContain(
                'FIRST_VALUE("revenue_sum") OVER (PARTITION BY "category" ORDER BY "revenue_sum" DESC NULLS LAST ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );
        });

        test('Should include NULLS clause in row_index ordering when sorting by value column', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'revenue',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Row index should include NULLS FIRST when sorting by value column
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" ASC NULLS FIRST, g."date" ASC) AS "row_index"',
            );
        });

        test('Should include NULLS clause in column_index ordering when sorting by value column', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'revenue',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Column index should include NULLS LAST in column_ranking CTE
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_column_anchor"."revenue_column_anchor_value" DESC NULLS LAST, g."category" ASC) AS "col_idx"',
            );
        });

        test('Should handle mixed nullsFirst settings across multiple sort columns', () => {
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'store_id', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'date',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                    {
                        reference: 'store_id',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain(
                'ORDER BY "date" ASC NULLS FIRST, "store_id" DESC NULLS LAST',
            );
        });

        test('Should not include NULLS clause when nullsFirst is undefined', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'event_id',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'date',
                        direction: SortByDirection.ASC,
                        // nullsFirst not specified
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();
            expect(result).toContain('ORDER BY "date" ASC');
            expect(result).not.toContain('NULLS FIRST');
            expect(result).not.toContain('NULLS LAST');
        });

        test('Should use LEFT JOIN for anchor CTEs to preserve rows with NULL anchor values', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'revenue',
                        direction: SortByDirection.DESC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Should use LEFT JOIN for both row and column anchor CTEs
            expect(result).toContain('LEFT JOIN "revenue_row_anchor" ON');
            expect(result).toContain('LEFT JOIN "revenue_column_anchor" ON');
            // Should not use regular JOIN (without LEFT)
            expect(result).not.toMatch(/(?<!LEFT )JOIN "revenue_row_anchor"/);
            expect(result).not.toMatch(
                /(?<!LEFT )JOIN "revenue_column_anchor"/,
            );
        });
    });

    describe('Time interval sorting', () => {
        // Mock dimensions
        const monthNameDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'month_name',
            label: 'Month Name',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.month_name',
            compiledSql: '"orders".month_name',
            tablesReferences: ['orders'],
            timeInterval: TimeFrames.MONTH_NAME,
            hidden: false,
        };

        const dayNameDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'day_name',
            label: 'Day Name',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.day_name',
            compiledSql: '"orders".day_name',
            tablesReferences: ['orders'],
            timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
            hidden: false,
        };

        const quarterNameDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'quarter_name',
            label: 'Quarter Name',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.quarter_name',
            compiledSql: '"orders".quarter_name',
            tablesReferences: ['orders'],
            timeInterval: TimeFrames.QUARTER_NAME,
            hidden: false,
        };

        const categoryDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'category',
            label: 'Category',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.category',
            compiledSql: '"orders".category',
            tablesReferences: ['orders'],
            hidden: false,
        };

        const regionDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'region',
            label: 'Region',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.region',
            compiledSql: '"orders".region',
            tablesReferences: ['orders'],
            hidden: false,
        };

        test('Should sort MONTH_NAME descending', () => {
            const itemsMap: ItemsMap = {
                orders_month_name: monthNameDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_month_name',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'orders_month_name',
                        direction: SortByDirection.DESC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE statement with DESC
            expect(result).toContain('CASE');
            expect(result).toContain(
                '"orders_month_name" = \'January\' THEN 1',
            );
        });

        test('Should sort MONTH_NAME in pivot query with groupBy columns', () => {
            const itemsMap: ItemsMap = {
                orders_month_name: monthNameDimension,
                orders_category: categoryDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_month_name',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'orders_category' }],
                sortBy: [
                    {
                        reference: 'orders_month_name',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE statement in DENSE_RANK for row_index
            expect(result).toContain('DENSE_RANK() OVER (ORDER BY');
            expect(result).toContain('CASE');
            expect(result).toContain(
                'g."orders_month_name" = \'January\' THEN 1',
            );
            // Should use replaceAll - all occurrences should have g. prefix
            const monthNameOccurrences = result.match(
                /g\."orders_month_name" =/g,
            );
            expect(monthNameOccurrences).toBeTruthy();
            expect(monthNameOccurrences!.length).toBe(12); // At least 12 in CASE statement
        });

        test('Should handle mixed time interval and regular fields in sorting', () => {
            const itemsMap: ItemsMap = {
                orders_month_name: monthNameDimension,
                orders_region: regionDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_month_name',
                        type: VizIndexType.CATEGORY,
                    },
                    { reference: 'orders_region', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'orders_month_name',
                        direction: SortByDirection.ASC,
                    },
                    {
                        reference: 'orders_region',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE for month_name but not for region
            expect(result).toContain(
                'WHEN "orders_month_name" = \'January\' THEN 1',
            );
            expect(result).toContain('ORDER BY');
            // Region should be simple field reference
            expect(result).toContain('"orders_region" ASC');
        });

        test('Should include NULLS clause with time interval sorting', () => {
            const itemsMap: ItemsMap = {
                orders_month_name: monthNameDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_month_name',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'orders_month_name',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE statement with NULLS FIRST at the end
            expect(result).toContain('CASE');
            expect(result).toContain(
                '"orders_month_name" = \'January\' THEN 1',
            );
            // For simple queries (no groupBy), the CASE is wrapped in parens and NULLS comes after
            // The sortMonthName function doesn't include ASC/DESC in the CASE statement - it's implicit
            expect(result).toContain('NULLS FIRST');
            expect(result).toContain('ORDER BY');
        });

        test('Should include NULLS LAST with DAY_OF_WEEK_NAME sorting in pivot query', () => {
            const itemsMap: ItemsMap = {
                orders_day_name: dayNameDimension,
                orders_category: categoryDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_day_name',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'orders_category' }],
                sortBy: [
                    {
                        reference: 'orders_day_name',
                        direction: SortByDirection.DESC,
                        nullsFirst: false,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE statement for day of week with NULLS LAST
            expect(result).toContain('CASE');
            // In pivot queries, the sortDayOfWeekName returns CASE...END) DESC and NULLS LAST is appended
            expect(result).toContain('DESC NULLS LAST');
        });

        test('Should include NULLS FIRST with QUARTER_NAME sorting', () => {
            const itemsMap: ItemsMap = {
                orders_quarter_name: quarterNameDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'orders_quarter_name',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [
                    {
                        reference: 'orders_quarter_name',
                        direction: SortByDirection.ASC,
                        nullsFirst: true,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // Should contain CASE statement for quarter with NULLS FIRST
            expect(result).toContain('CASE');
            expect(result).toContain("'Q1' THEN 1");
            // For simple queries (no groupBy), NULLS FIRST is appended after the sort expression
            expect(result).toContain('NULLS FIRST');
            expect(result).toContain('ORDER BY');
        });
    });

    describe('Custom bin dimension _order column handling', () => {
        const binDimension: CustomBinDimension = {
            id: 'amount_binned_amount',
            name: 'binned_amount',
            table: 'orders',
            type: CustomDimensionType.BIN,
            dimensionId: 'orders_amount',
            binType: BinType.FIXED_WIDTH,
            binWidth: 10,
        };

        const categoryDimension: CompiledDimension = {
            type: DimensionType.STRING,
            name: 'category',
            label: 'Category',
            table: 'orders',
            tableLabel: 'Orders',
            fieldType: FieldType.DIMENSION,
            sql: '${TABLE}.category',
            compiledSql: '"orders".category',
            tablesReferences: ['orders'],
            hidden: false,
        };

        test('Should include _order column in group_by_query and row_index when sorted bin dimension is an index', () => {
            const itemsMap: ItemsMap = {
                amount_binned_amount: binDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'amount_binned_amount',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    {
                        reference: 'amount_binned_amount',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // _order column should be in group_by_query SELECT and GROUP BY
            expect(result).toContain('"amount_binned_amount_order"');
            expect(replaceWhitespace(result)).toContain(
                'group by "event_type", "amount_binned_amount", "amount_binned_amount_order"',
            );

            // row_index should use _order column for sorting
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."amount_binned_amount_order" asc) as "row_index"',
            );
        });

        test('Should include _order column in group_by_query and column_index when sorted bin dimension is a groupBy', () => {
            const itemsMap: ItemsMap = {
                amount_binned_amount: binDimension,
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'amount_binned_amount' }],
                sortBy: [
                    {
                        reference: 'amount_binned_amount',
                        direction: SortByDirection.DESC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // _order column should be in group_by_query
            expect(result).toContain('"amount_binned_amount_order"');
            expect(replaceWhitespace(result)).toContain(
                'group by "amount_binned_amount", "date", "amount_binned_amount_order"',
            );

            // column_index should use _order column for sorting
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."amount_binned_amount_order" desc) as "column_index"',
            );
        });

        test('Should NOT include _order column when bin dimension is not sorted', () => {
            const itemsMap: ItemsMap = {
                amount_binned_amount: binDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'amount_binned_amount',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    {
                        reference: 'event_type',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // _order column should NOT be present — MetricQueryBuilder only generates it
            // when the bin dimension has an explicit sort entry
            expect(result).not.toContain('amount_binned_amount_order');
        });

        test('Should handle mixed sorted bin dimension + regular dimension', () => {
            const itemsMap: ItemsMap = {
                amount_binned_amount: binDimension,
                orders_category: categoryDimension,
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'amount_binned_amount',
                        type: VizIndexType.CATEGORY,
                    },
                    {
                        reference: 'orders_category',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'event_type' }],
                sortBy: [
                    {
                        reference: 'amount_binned_amount',
                        direction: SortByDirection.ASC,
                    },
                    {
                        reference: 'orders_category',
                        direction: SortByDirection.DESC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // _order column should be present for the bin dimension only
            expect(result).toContain('"amount_binned_amount_order"');
            expect(result).not.toContain('"orders_category_order"');

            // row_index should use _order for bin dim and regular ref for category
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."amount_binned_amount_order" asc, g."orders_category" desc)',
            );
        });
    });

    describe('Table calculations with interdependencies', () => {
        test('Should handle interdependent table calculations in pivot queries', () => {
            // Mock ItemsMap with interdependent table calculations
            const itemsMapWithTableCalcs: ItemsMap = {
                impressions: {
                    name: 'impressions',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Impressions',
                    sql: 'COALESCE(${table1.metric1}, 0)',
                },
                impressions_delta: {
                    name: 'impressions_delta',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Impressions Delta',
                    sql: '${impressions} - pivot_offset(${impressions}, -1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'metric1',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'impressions',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'impressions_delta',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, metric1 FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMapWithTableCalcs,
            );

            const result = builder.toSql();

            // The SQL should contain the table calculations handled in pivot_table_calculations CTE
            expect(result).toContain('pivot_table_calculations');

            // The impressions_delta calculation uses LAG function with proper reference replacement
            // The key fix being tested: When replacing field references, it now also checks
            // fieldAliasMap[ref] to handle interdependent table calculation references
            expect(result).toContain(
                'impressions_any - CASE WHEN LAG("row_index", 1)',
            );
            expect(result).toContain('LAG(impressions_any, 1)');

            // Verify that table calculations with pivot functions are properly included
            expect(result).toContain('impressions_delta_any');

            // The group_by_query should include the aggregations for the table calculations
            expect(result).toContain(
                '(ARRAY_AGG("impressions"))[1] AS "impressions_any"',
            );
            expect(result).toContain(
                '(ARRAY_AGG("impressions_delta"))[1] AS "impressions_delta_any"',
            );
        });
    });

    describe('Group limit with "Other" aggregation', () => {
        const rawOtherPivotSource: PivotSourceContract = {
            query: 'SELECT "date" AS "date", "region" AS "region", "amount" AS "__metric_revenue_value", "user_id" AS "__metric_unique_users_value", "shipping_cost" AS "__metric_avg_shipping_cost_value", "line_item_id" AS "__metric_avg_shipping_cost_dk_0" FROM raw_events',
            metricInputs: {
                revenue: {
                    strategy: 'simple',
                    inputAlias: '__metric_revenue_value',
                    aggregateWith: 'SUM',
                },
                unique_users: {
                    strategy: 'count_distinct',
                    inputAlias: '__metric_unique_users_value',
                },
                avg_shipping_cost: {
                    strategy: 'distinct_dedup',
                    inputAlias: '__metric_avg_shipping_cost_value',
                    distinctKeyAliases: ['__metric_avg_shipping_cost_dk_0'],
                    aggregateWith: 'AVG',
                },
            },
        };

        test('Should generate ranking CTEs and CASE WHEN when groupLimit is enabled', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('pre_group_by AS');
            expect(normalized).toContain('__group_totals AS');
            expect(normalized).toContain('__group_ranking AS');
            expect(normalized).toContain(
                'total_groups AS (SELECT COUNT(*) AS total_groups FROM (SELECT DISTINCT "region" FROM pre_group_by) AS distinct_groups)',
            );
            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 3 THEN CAST(o."region" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
            expect(normalized).toContain('LEFT JOIN __group_ranking gr ON');
            expect(normalized).toContain('CROSS JOIN total_groups g');
        });

        test('Should rank null group totals last when applying groupLimit', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain(
                'ROW_NUMBER() OVER (ORDER BY __ranking_value DESC NULLS LAST, "region" ASC) AS __group_rn',
            );
        });

        test('Should not generate ranking CTEs when groupLimit is disabled', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: false, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();

            expect(result).not.toContain('pre_group_by');
            expect(result).not.toContain('__group_totals');
            expect(result).not.toContain('__group_ranking');
            expect(result).not.toContain('Other');
            expect(replaceWhitespace(result)).toContain(
                'total_groups AS (SELECT COUNT(*) AS total_groups FROM (SELECT DISTINCT "region" FROM group_by_query) AS distinct_groups)',
            );
        });

        test('Should use correct aggregation for "Other" re-aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('sum("revenue") AS "revenue_sum"');
            expect(normalized).toContain('count("count") AS "count_count"');
        });

        test('Should use drop mode (WHERE filter, no "Other" row) when otherAggregation is null', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: null,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('pre_group_by AS');
            expect(normalized).toContain('__group_totals AS');
            expect(normalized).toContain('__group_ranking AS');
            expect(normalized).toContain('WHERE gr.__group_rn <= 3');
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(result).not.toContain('Other');
        });

        test('Should use otherAggregation when specified on valuesColumn', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('__group_ranking');
            expect(normalized).toContain('sum("revenue") AS "revenue_any"');
        });

        test('Should handle multiple group-by columns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'region' },
                    { reference: 'category' },
                ],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 3 THEN CAST(o."region" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 3 THEN CAST(o."category" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
            expect(normalized).toContain(
                '( o."region" = gr."region" OR ( o."region" IS NULL AND gr."region" IS NULL ) ) AND ( o."category" = gr."category" OR ( o."category" IS NULL AND gr."category" IS NULL ) )',
            );
        });

        test('Should not apply "Other" when there are no groupByColumns', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();

            expect(result).not.toContain('__group_ranking');
            expect(result).not.toContain('Other');
        });

        test('Should use first metric for ranking', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'orders',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 5 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain(
                'SUM(ABS("revenue_sum")) AS __ranking_value',
            );
        });

        test('Should create Other bucket for COUNT_DISTINCT using SUM', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('pre_group_by AS');
            expect(normalized).toContain('__group_ranking AS');
            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 3 THEN CAST(o."region" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
            expect(normalized).toContain(
                'sum("unique_users") AS "unique_users_sum"',
            );
        });

        test('Should use drop mode when mixing SUM and unsupported aggregation', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'avg_price',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: null,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('pre_group_by AS');
            expect(normalized).toContain('__group_ranking AS');
            expect(normalized).toContain('WHERE gr.__group_rn <= 3');
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(result).not.toContain('Other');
        });

        test('Should use Other mode for COUNT_DISTINCT + SUM together', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain('pre_group_by AS');
            expect(normalized).toContain('__group_ranking AS');
            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 2 THEN CAST(o."region" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
            expect(normalized).toContain('sum("revenue") AS "revenue_sum"');
            expect(normalized).toContain(
                'sum("unique_users") AS "unique_users_sum"',
            );
        });

        test('Should use raw_other path for COUNT_DISTINCT when feature flag is enabled', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                rawOtherPivotSource,
                true,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain('__pre_group_scope AS');
            expect(normalized).toContain(
                'pivot_source AS (SELECT "date" AS "date", "region" AS "region"',
            );
            expect(normalized).toContain('bucketed_source AS');
            expect(normalized).toContain(
                'COUNT(DISTINCT b."__metric_unique_users_value") AS "unique_users_any"',
            );
            expect(normalized).not.toContain(
                'sum("unique_users") AS "unique_users_any"',
            );
        });

        test('Should use a null-safe join when bucketing ranked raw_other groups', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                rawOtherPivotSource,
                true,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain(
                'LEFT JOIN __group_ranking gr ON ( ss."region" = gr."region" OR ( ss."region" IS NULL AND gr."region" IS NULL ) )',
            );
        });

        test('Should use raw_other dedup CTE for average_distinct when feature flag is enabled', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'avg_shipping_cost',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: null,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                rawOtherPivotSource,
                true,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain('__dd_avg_shipping_cost_any AS');
            expect(normalized).toContain(
                'ROW_NUMBER() OVER (PARTITION BY "region", "date", "__metric_avg_shipping_cost_dk_0"',
            );
            expect(normalized).toContain(
                'CAST(SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) AS DOUBLE PRECISION)',
            );
        });

        test('Should drop when raw_other flag is enabled but pivotSource is missing', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'avg_shipping_cost',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: null,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                true,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('pivot_source AS');
            expect(normalized).not.toContain('Other');
        });

        test('Should drop when raw_other flag is enabled and an unsupported metric has no otherAggregation override', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'avg_price',
                        aggregation: VizAggregationOptions.AVERAGE,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                true,
            );

            const normalized = replaceWhitespace(builder.toSql());

            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('pivot_source AS');
            expect(normalized).not.toContain('Other');
        });

        test('Both fast_other and raw_other use null-safe joins for group ranking', () => {
            const fastOtherConfig = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const fastOtherBuilder = new PivotQueryBuilder(
                baseSql,
                fastOtherConfig,
                mockWarehouseSqlBuilder,
                500,
            );

            const fastOtherSql = replaceWhitespace(fastOtherBuilder.toSql());

            // fast_other must use null-safe join so NULL groups are ranked correctly
            expect(fastOtherSql).toContain(
                '( o."region" = gr."region" OR ( o."region" IS NULL AND gr."region" IS NULL ) )',
            );

            // raw_other also uses null-safe join
            const rawOtherConfig = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const rawOtherBuilder = new PivotQueryBuilder(
                baseSql,
                rawOtherConfig,
                mockWarehouseSqlBuilder,
                500,
                {},
                rawOtherPivotSource,
                true,
            );

            const rawOtherSql = replaceWhitespace(rawOtherBuilder.toSql());

            expect(rawOtherSql).toContain(
                '( ss."region" = gr."region" OR ( ss."region" IS NULL AND gr."region" IS NULL ) )',
            );
        });

        test('T1/T2: fast_other uses SUM for COUNT_DISTINCT while raw_other uses COUNT(DISTINCT)', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const fastOtherBuilder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );
            const fastOtherSql = replaceWhitespace(fastOtherBuilder.toSql());

            const rawOtherBuilder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                rawOtherPivotSource,
                true,
            );
            const rawOtherSql = replaceWhitespace(rawOtherBuilder.toSql());

            expect(fastOtherSql).toContain(
                'sum("unique_users") AS "unique_users_any"',
            );

            expect(rawOtherSql).toContain(
                'COUNT(DISTINCT b."__metric_unique_users_value") AS "unique_users_any"',
            );
        });

        test('T2: Explorer + flag OFF routes COUNT_DISTINCT to fast_other with SUM (not drop)', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );
            const sql = replaceWhitespace(builder.toSql());

            expect(sql).toContain('pre_group_by AS');
            expect(sql).toContain('__group_ranking AS');
            expect(sql).toContain("ELSE '$$_lightdash_other_$$' END");
            expect(sql).not.toContain('WHERE gr.__group_rn <=');
        });
    });

    describe('grouping mode fallback chain', () => {
        test('uses no group limit when groupLimit is disabled', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [{ reference: 'region' }],
                    sortBy: undefined,
                    groupLimit: { enabled: false, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                true,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).not.toContain('__group_ranking');
            expect(sql).not.toContain('__group_rn');
        });

        test('uses no group limit when groupByColumns is empty', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [],
                    sortBy: undefined,
                    groupLimit: { enabled: true, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                true,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).not.toContain('__group_ranking');
        });

        test('falls back to drop when rawOtherEnabled but pivotSource is undefined (AVERAGE without primaryKey scenario)', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'avg_shipping_cost',
                            aggregation: VizAggregationOptions.ANY,
                            otherAggregation: null,
                        },
                    ],
                    groupByColumns: [{ reference: 'region' }],
                    sortBy: undefined,
                    groupLimit: { enabled: true, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                true,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).toContain('WHERE gr.__group_rn <= 2');
            expect(sql).not.toContain('pivot_source AS');
            expect(sql).not.toContain('$$_lightdash_other_$$');
        });

        test('falls back to drop when rawOtherEnabled but pivotSource has no matching metric inputs', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'missing_metric',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                    groupByColumns: [{ reference: 'region' }],
                    sortBy: undefined,
                    groupLimit: { enabled: true, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                {
                    query: 'SELECT 1',
                    metricInputs: {},
                },
                true,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).toContain('WHERE gr.__group_rn <= 2');
            expect(sql).not.toContain('pivot_source AS');
        });

        test('uses fast_other when not rawOtherEnabled and all metrics have otherAggregation', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                            otherAggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [{ reference: 'region' }],
                    sortBy: undefined,
                    groupLimit: { enabled: true, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).toContain("ELSE '$$_lightdash_other_$$' END");
            expect(sql).not.toContain('WHERE gr.__group_rn <=');
            expect(sql).not.toContain('pivot_source AS');
        });

        test('falls back to drop when not rawOtherEnabled and a metric has null otherAggregation', () => {
            const builder = new PivotQueryBuilder(
                baseSql,
                {
                    indexColumn: [
                        { reference: 'date', type: VizIndexType.TIME },
                    ],
                    valuesColumns: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                            otherAggregation: VizAggregationOptions.SUM,
                        },
                        {
                            reference: 'count_distinct_metric',
                            aggregation: VizAggregationOptions.ANY,
                            otherAggregation: null,
                        },
                    ],
                    groupByColumns: [{ reference: 'region' }],
                    sortBy: undefined,
                    groupLimit: { enabled: true, maxGroups: 2 },
                },
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );
            const sql = replaceWhitespace(builder.toSql());
            expect(sql).toContain('WHERE gr.__group_rn <= 2');
            expect(sql).not.toContain('$$_lightdash_other_$$');
        });
    });

    describe('Group limit edge cases and fallback chain', () => {
        test('Should fall back to none mode when maxGroups is NaN', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: NaN },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            expect(result).not.toContain('NaN');
            expect(result).not.toContain('Infinity');
            // Should fall back to none mode — no grouping CTEs
            const normalized = replaceWhitespace(result);
            expect(normalized).not.toContain('pre_group_by AS');
            expect(normalized).not.toContain('__group_ranking AS');
        });

        test('Should fall back to none mode when maxGroups is Infinity', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: Infinity },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            expect(result).not.toContain('NaN');
            expect(result).not.toContain('Infinity');
            const normalized = replaceWhitespace(result);
            expect(normalized).not.toContain('pre_group_by AS');
            expect(normalized).not.toContain('__group_ranking AS');
        });

        test('Should produce valid SQL when maxGroups is negative', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: -5 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            expect(result).not.toContain('NaN');
            expect(result).not.toContain('Infinity');
            // Math.max(1, Math.floor(-5)) = 1, so should clamp to 1
            expect(replaceWhitespace(result)).toContain('__group_rn <= 1');
        });

        test('Should return none mode when groupLimit is disabled', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: false, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // No grouping CTEs should be present
            expect(normalized).not.toContain('pre_group_by AS');
            expect(normalized).not.toContain('__group_ranking AS');
            expect(normalized).not.toContain('$$_lightdash_other_$$');
        });

        test('Should return none mode when groupByColumns is empty', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 3 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            expect(normalized).not.toContain('pre_group_by AS');
            expect(normalized).not.toContain('__group_ranking AS');
        });

        test('Should use drop mode when rawOtherEnabled but pivotSource is missing', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined, // no pivotSource
                true, // rawOtherEnabled
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // Drop mode: INNER JOIN with WHERE clause, no CASE WHEN
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('$$_lightdash_other_$$');
        });

        test('Should use fast_other mode when rawOtherEnabled is false and all metrics are additive', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false, // rawOtherEnabled=false
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // fast_other: CASE WHEN with sentinel value
            expect(normalized).toContain(
                'CASE WHEN gr.__group_rn <= 2 THEN CAST(o."region" AS TEXT) ELSE \'$$_lightdash_other_$$\' END',
            );
        });

        test('Should use drop mode in fast_other path when otherAggregation is null', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: null, // unsupported for fast_other
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // Should fall to drop mode
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('$$_lightdash_other_$$');
        });

        test('Should use drop mode when rawOtherEnabled and pivotSource missing metric inputs', () => {
            const incompletePivotSource: PivotSourceContract = {
                query: 'SELECT * FROM raw_events',
                metricInputs: {}, // No metric inputs
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                incompletePivotSource,
                true,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // Should fall to drop mode because metric not in pivotSource.metricInputs
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('$$_lightdash_other_$$');
        });

        test('Should route COUNT_DISTINCT to count_distinct strategy in raw_other path', () => {
            const countDistinctSource: PivotSourceContract = {
                query: 'SELECT "date" AS "date", "region" AS "region", "user_id" AS "__metric_unique_users_value" FROM raw_events',
                metricInputs: {
                    unique_users: {
                        strategy: 'count_distinct',
                        inputAlias: '__metric_unique_users_value',
                    },
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                countDistinctSource,
                true,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // raw_other path: should use COUNT(DISTINCT ...) not SUM(...)
            expect(normalized).toContain(
                'COUNT(DISTINCT b."__metric_unique_users_value")',
            );
            expect(normalized).not.toContain(
                'SUM(b."__metric_unique_users_value")',
            );
        });

        test('Should use drop mode for COUNT_DISTINCT in fast_other path (otherAggregation=null)', () => {
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'unique_users',
                        aggregation: VizAggregationOptions.ANY,
                        otherAggregation: null, // COUNT_DISTINCT maps to null in fast_other
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
                groupLimit: { enabled: true, maxGroups: 2 },
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {},
                undefined,
                false,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);
            // fast_other path with null otherAggregation should fall to drop
            expect(normalized).toContain('INNER JOIN __group_ranking gr ON');
            expect(normalized).toContain('WHERE gr.__group_rn <= 2');
            expect(normalized).not.toContain('$$_lightdash_other_$$');
        });
    });
});
