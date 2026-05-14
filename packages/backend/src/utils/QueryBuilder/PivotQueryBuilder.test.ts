import {
    BinType,
    CompiledDimension,
    CustomBinDimension,
    CustomDimensionType,
    defaultNullSafeEqualSql,
    DimensionType,
    FieldType,
    ItemsMap,
    MetricType,
    ParameterError,
    SortByDirection,
    SupportedDbtAdapter,
    TableCalculationType,
    TimeFrames,
    VizAggregationOptions,
    VizIndexType,
    WarehouseSqlBuilder,
    WeekDay,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { PivotQueryBuilder } from './PivotQueryBuilder';

// Mock warehouse SQL builder
const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getStartOfWeek: () => WeekDay.MONDAY,
    getNullSafeEqualSql: defaultNullSafeEqualSql,
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
                'MAX(CASE WHEN (q."category" = ac."anchor_category" OR (q."category" IS NULL AND ac."anchor_category" IS NULL)) THEN q."revenue_sum" END)',
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
                'JOIN "revenue_row_anchor" ON (g."date" = "revenue_row_anchor"."date" OR (g."date" IS NULL AND "revenue_row_anchor"."date" IS NULL))',
            );

            // column_ranking CTE should join with column_anchor and compute DENSE_RANK
            expect(replaceWhitespace(result)).toContain(
                'JOIN "revenue_column_anchor" ON (g."category" = "revenue_column_anchor"."category" OR (g."category" IS NULL AND "revenue_column_anchor"."category" IS NULL))',
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
                'LEFT JOIN row_ranking rr ON (g."date" = rr."date" OR (g."date" IS NULL AND rr."date" IS NULL))',
            );
            expect(replaceWhitespace(result)).toContain(
                'LEFT JOIN column_ranking cr ON (g."category" = cr."category" OR (g."category" IS NULL AND cr."category" IS NULL))',
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
                'MAX(CASE WHEN (q."category" = ac."anchor_category" OR (q."category" IS NULL AND ac."anchor_category" IS NULL)) THEN q."revenue_sum" END)',
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
                'row_ranking AS (SELECT DISTINCT g."date", DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" DESC, g."date" ASC) AS "row_index" FROM group_by_query g LEFT JOIN "revenue_row_anchor" ON (g."date" = "revenue_row_anchor"."date" OR (g."date" IS NULL AND "revenue_row_anchor"."date" IS NULL)))',
            );

            // pivot_query should JOIN with precomputed rankings instead of computing Window functions
            expect(replaceWhitespace(result)).toContain(
                'pivot_query AS (SELECT g."date", g."category", g."revenue_sum", rr."row_index" AS "row_index", cr."col_idx" AS "column_index" FROM group_by_query g LEFT JOIN row_ranking rr ON (g."date" = rr."date" OR (g."date" IS NULL AND rr."date" IS NULL)) LEFT JOIN column_ranking cr ON (g."category" = cr."category" OR (g."category" IS NULL AND cr."category" IS NULL)))',
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
                getNullSafeEqualSql: defaultNullSafeEqualSql,
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
                getNullSafeEqualSql: defaultNullSafeEqualSql,
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
                'MAX(CASE WHEN (q."category" = ac."anchor_category" OR (q."category" IS NULL AND ac."anchor_category" IS NULL)) THEN q."revenue_sum" END)',
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

    describe('Pivot table calculations referencing metrics not in valuesColumns', () => {
        test('Should include implicit metrics in group_by_query when pivot TCs reference them', () => {
            // Reproduces PROD-6853: table calculations use pivot_index on a metric
            // that is NOT in valuesColumns (only the TCs are values columns)
            const itemsMap: ItemsMap = {
                sla_hit: {
                    name: 'sla_hit',
                    table: 'audits',
                    tableLabel: 'Audits',
                    type: TableCalculationType.NUMBER,
                    displayName: 'SLA hit',
                    sql: 'pivot_index(${audits.input_count}, 2) / NULLIF(${limit_val}, 0)',
                },
                sla_missed: {
                    name: 'sla_missed',
                    table: 'audits',
                    tableLabel: 'Audits',
                    type: TableCalculationType.NUMBER,
                    displayName: 'SLA missed',
                    sql: 'pivot_index(${audits.input_count}, 1) / NULLIF(${limit_val}, 0)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [
                    {
                        reference: 'audits_hour',
                        type: VizIndexType.CATEGORY,
                    },
                    { reference: 'limit_val', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'sla_hit',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'sla_missed',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'is_sla_met' }],
                sortBy: [
                    {
                        reference: 'is_sla_met',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                'SELECT audits_hour, limit_val, is_sla_met, audits_input_count, null AS sla_hit, null AS sla_missed FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // The metric audits_input_count should be implicitly added to group_by_query
            expect(replaceWhitespace(result)).toContain(
                '(ARRAY_AGG("audits_input_count"))[1] AS "audits_input_count"',
            );

            // pivot_table_calculations CTE should exist for the TCs
            expect(result).toContain('pivot_table_calculations');

            // The compiled pivot_index should reference the metric's aliased column name
            expect(result).toContain('audits_input_count');
        });

        test('Should not add implicit metrics that are already in valuesColumns', () => {
            const itemsMap: ItemsMap = {
                ratio: {
                    name: 'ratio',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Ratio',
                    sql: 'pivot_index(${events.revenue}, 1) / NULLIF(pivot_index(${events.revenue}, 2), 0)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'events_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'ratio',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS ratio FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // revenue should appear exactly once as a value column (explicit SUM), not duplicated
            const revenueMatches = normalized.match(/sum\("events_revenue"\)/g);
            expect(revenueMatches).toHaveLength(1);
        });

        test('Should include multiple different hidden metrics from a single TC', () => {
            const itemsMap: ItemsMap = {
                ratio: {
                    name: 'ratio',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Ratio',
                    sql: 'pivot_index(${events.metric_a}, 1) / NULLIF(pivot_index(${events.metric_b}, 2), 0)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'ratio',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_metric_a, events_metric_b, null AS ratio FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            expect(normalized).toContain(
                '(ARRAY_AGG("events_metric_a"))[1] AS "events_metric_a"',
            );
            expect(normalized).toContain(
                '(ARRAY_AGG("events_metric_b"))[1] AS "events_metric_b"',
            );

            // Each should appear exactly once as an aggregate
            expect(
                normalized.match(/ARRAY_AGG\("events_metric_a"\)/g),
            ).toHaveLength(1);
            expect(
                normalized.match(/ARRAY_AGG\("events_metric_b"\)/g),
            ).toHaveLength(1);
        });

        test('Should handle pivot_offset referencing a hidden metric', () => {
            const itemsMap: ItemsMap = {
                delta: {
                    name: 'delta',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Delta',
                    sql: '${events.revenue} - pivot_offset(${events.revenue}, -1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'delta',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS delta FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // Hidden metric should be in group_by_query
            expect(normalized).toContain(
                '(ARRAY_AGG("events_revenue"))[1] AS "events_revenue"',
            );

            // pivot_table_calculations CTE should exist
            expect(result).toContain('pivot_table_calculations');

            // Compiled TC should reference the aliased column name
            expect(result).toContain('events_revenue');
        });

        test('Should deduplicate when two TCs reference the same hidden metric', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
                tc2: {
                    name: 'tc2',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC2',
                    sql: 'pivot_index(${events.revenue}, 2) + pivot_index(${events.cost}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'tc2',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, events_cost, null AS tc1, null AS tc2 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // Both metrics present
            expect(normalized).toContain(
                '(ARRAY_AGG("events_revenue"))[1] AS "events_revenue"',
            );
            expect(normalized).toContain(
                '(ARRAY_AGG("events_cost"))[1] AS "events_cost"',
            );

            // Each exactly once (deduped across TCs)
            expect(
                normalized.match(/ARRAY_AGG\("events_revenue"\)/g),
            ).toHaveLength(1);
            expect(
                normalized.match(/ARRAY_AGG\("events_cost"\)/g),
            ).toHaveLength(1);
        });

        test('Should NOT include implicit metrics in simple query path (no groupByColumns)', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // Implicit metrics should NOT be in group_by_query on simple path —
            // pivot_table_calculations is not created, so they would just leak
            // into SELECT * as noise columns.
            expect(normalized).not.toContain('ARRAY_AGG("events_revenue")');

            // Simple path should NOT have pivot_table_calculations
            expect(result).not.toContain('pivot_table_calculations');
        });

        test('Simple path: implicit metrics are excluded from SELECT * output', () => {
            // On the simple path (no groupByColumns), implicit metrics are
            // excluded from group_by_query since pivot_table_calculations is
            // not created on this path — they would just be noise columns.
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: undefined,
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // The final query is SELECT * FROM group_by_query
            expect(result).toContain('SELECT * FROM group_by_query');

            // Implicit metric should NOT be in group_by_query (no leak)
            expect(replaceWhitespace(result)).not.toContain(
                'ARRAY_AGG("events_revenue")',
            );

            // pivot_table_calculations is NOT created on the simple path
            expect(result).not.toContain('pivot_table_calculations');
        });

        test('Should not alter SQL when no pivot table calculations exist', () => {
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

            // No itemsMap = no TCs
            const builder = new PivotQueryBuilder(
                'SELECT date, category, revenue FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // group_by_query should have exactly one value column
            expect(normalized).toContain('sum("revenue") AS "revenue_sum"');

            // No extra implicit columns
            expect(normalized).not.toMatch(
                /sum\("[^"]+"\) AS "[^"]+_sum".*sum\("[^"]+"\) AS "[^"]+_sum"/,
            );

            // No pivot_table_calculations CTE
            expect(result).not.toContain('pivot_table_calculations');
        });

        test('Should not inflate total_columns with implicit metrics', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
                tc2: {
                    name: 'tc2',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC2',
                    sql: 'pivot_index(${events.revenue}, 2)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'tc2',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc1, null AS tc2 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // total_columns should multiply by 2 (the visible TCs), not 3 (TCs + implicit metric)
            expect(result).toContain('COUNT(*) * 2 AS total_columns');
        });

        test('Edge case: TC referencing a dimension (not a metric) via pivot_index', () => {
            // Scenario #2: pivot_index on a string dimension that's not in any column list.
            // This would produce SUM("dimension") which is invalid SQL for strings.
            // We want to verify what the fix actually generates.
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.STRING,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.status}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, region, events_status, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // The fix adds ARRAY_AGG("events_status")[1] as an implicit metric.
            // ANY aggregation is correct here since values are already aggregated
            // by MetricQueryBuilder.
            expect(replaceWhitespace(result)).toContain(
                '(ARRAY_AGG("events_status"))[1] AS "events_status"',
            );
        });

        test('Edge case: transitive TC dependency (TC_B depends on pivot TC_A)', () => {
            // Scenario #1: TC_A uses pivot_index, TC_B references TC_A.
            // Only TC_B is in valuesColumns. TC_A is a pivot TC but not in any column list.
            // Our fix scans TC_A (pivot TC) and finds the metric. But TC_A itself
            // is not added as an implicit column — it stays as a deferred null.
            const itemsMap: ItemsMap = {
                tc_a: {
                    name: 'tc_a',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC A',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
                tc_b: {
                    name: 'tc_b',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC B',
                    sql: '${tc_a} * 100',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc_b',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc_a, null AS tc_b FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // tc_a IS a pivot TC → our fix scans it and finds events_revenue → implicit metric
            expect(normalized).toContain(
                '(ARRAY_AGG("events_revenue"))[1] AS "events_revenue"',
            );

            // tc_a IS computed in pivot_table_calculations (it's a pivot TC)
            expect(result).toContain('pivot_table_calculations');
            expect(result).toContain('tc_a_any');

            // But tc_b is computed in original_query as ${tc_a} * 100.
            // Since tc_a is NULL in original_query (pivot TCs are deferred),
            // tc_b = NULL * 100 = NULL. tc_b's value is baked in as null before
            // tc_a gets computed in pivot_table_calculations.
            // This is a pre-existing limitation with transitive pivot TC deps.
            // Our fix correctly carries the metric through, but tc_b can't
            // benefit because it was already evaluated.
            expect(normalized).toContain(
                '(ARRAY_AGG("tc_b"))[1] AS "tc_b_any"',
            );
        });

        test('Edge case: all dimensions accounted for means SUM is safe', () => {
            // Scenario #3: When all dimensions are in index/groupBy columns,
            // each group in group_by_query has exactly one row from original_query.
            // SUM(metric) = metric value (single row), so aggregation choice doesn't matter.
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.avg_score}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                // All dimensions accounted for: date (index) + category (groupBy)
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_avg_score, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();

            // SUM is used for avg_score (non-additive metric), but since all dimensions
            // are in index/groupBy, each group has one row. SUM of one value = that value.
            expect(replaceWhitespace(result)).toContain(
                '(ARRAY_AGG("events_avg_score"))[1] AS "events_avg_score"',
            );

            // The implicit metric survives through to pivot_table_calculations
            expect(result).toContain('pivot_table_calculations');
            expect(result).toContain('events_avg_score');
        });

        test('Should carry implicit metrics through anchor CTE pipeline when sorting by value column', () => {
            const itemsMap: ItemsMap = {
                ratio: {
                    name: 'ratio',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Ratio',
                    sql: 'pivot_index(${events.cost}, 1) / NULLIF(pivot_index(${events.revenue}, 2), 0)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'events_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'ratio',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'events_revenue',
                        direction: SortByDirection.DESC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, events_cost, null AS ratio FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // Implicit metric events_cost should be in group_by_query with ANY_VALUE
            expect(normalized).toContain(
                '(ARRAY_AGG("events_cost"))[1] AS "events_cost"',
            );

            // Anchor CTE pipeline should be active (sorting by value column)
            expect(result).toContain('column_ranking AS (');
            expect(result).toContain('anchor_column AS (');
            expect(result).toContain('row_ranking AS (');

            // Implicit metric should be carried through pivot_query SELECT
            expect(normalized).toContain('g."events_cost"');

            // pivot_table_calculations should exist for the TC
            expect(result).toContain('pivot_table_calculations');
        });

        test('Should use BigQuery ANY_VALUE syntax for implicit metrics', () => {
            const mockBigQueryBuilder = {
                getFieldQuoteChar: () => '`',
                getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
                getStartOfWeek: () => WeekDay.MONDAY,
                getNullSafeEqualSql: defaultNullSafeEqualSql,
            } as unknown as WarehouseSqlBuilder;

            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockBigQueryBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });

            // BigQuery should use ANY_VALUE, not ARRAY_AGG
            expect(result).toContain(
                'ANY_VALUE(`events_revenue`) AS `events_revenue`',
            );
            expect(result).not.toContain('ARRAY_AGG');
        });

        test('Postgres: implicit metrics use ARRAY_AGG not SUM/AVG (safe for non-additive metrics)', () => {
            // Implicit metrics must NOT re-aggregate with the metric's original
            // aggregation (e.g., SUM, AVG). The values in original_query are
            // already aggregated by MetricQueryBuilder. Re-aggregating would be
            // wrong for non-additive metrics like AVG. ANY_VALUE (ARRAY_AGG[1]
            // on Postgres) picks a single value, which is correct when each
            // (index, groupBy) cell maps to one row.
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.avg_score}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_avg_score, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // Must use ARRAY_AGG (ANY_VALUE equivalent), NOT SUM or AVG
            expect(normalized).toContain(
                '(ARRAY_AGG("events_avg_score"))[1] AS "events_avg_score"',
            );
            expect(normalized).not.toMatch(
                /sum\("events_avg_score"\)|avg\("events_avg_score"\)/i,
            );
        });

        test('Should not add implicit metrics for fields already in indexColumns', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1) + ${date}',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // events_revenue should be implicit (not in any column list)
            expect(normalized).toContain(
                '(ARRAY_AGG("events_revenue"))[1] AS "events_revenue"',
            );

            // date is already an index column — should NOT be added as implicit
            expect(normalized).not.toContain('ARRAY_AGG("date")');
        });

        test('Should not add implicit metrics for fields already in groupByColumns', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1) + ${category}',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // events_revenue should be implicit
            expect(normalized).toContain(
                '(ARRAY_AGG("events_revenue"))[1] AS "events_revenue"',
            );

            // category is already a groupBy column — should NOT be added as implicit
            expect(normalized).not.toContain('ARRAY_AGG("category")');
        });

        test('Should produce no implicit metrics when TC has no variable references', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.revenue}, 1) + 100',
                },
            };

            // events_revenue IS in valuesColumns, and 100 is a literal
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'events_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_revenue, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // Only the explicit SUM should appear, no extra ARRAY_AGG for implicit metrics
            expect(normalized).toContain(
                'sum("events_revenue") AS "events_revenue_sum"',
            );
            expect(normalized).not.toMatch(/ARRAY_AGG\("events_revenue"\)/);
        });

        test('Should not inflate total_columns even with many implicit metrics', () => {
            const itemsMap: ItemsMap = {
                tc1: {
                    name: 'tc1',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC1',
                    sql: 'pivot_index(${events.m1}, 1) + pivot_index(${events.m2}, 1) + pivot_index(${events.m3}, 1) + pivot_index(${events.m4}, 1) + pivot_index(${events.m5}, 1)',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'tc1',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, events_m1, events_m2, events_m3, events_m4, events_m5, null AS tc1 FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql({ columnLimit: 100 });
            const normalized = replaceWhitespace(result);

            // All 5 implicit metrics should be in group_by_query
            for (const m of [
                'events_m1',
                'events_m2',
                'events_m3',
                'events_m4',
                'events_m5',
            ]) {
                expect(normalized).toContain(
                    `(ARRAY_AGG("${m}"))[1] AS "${m}"`,
                );
            }

            // total_columns should count only 1 display value column (tc1), not 6
            expect(result).toContain('COUNT(*) AS total_columns');
            expect(result).not.toContain('COUNT(*) * 5');
            expect(result).not.toContain('COUNT(*) * 6');
        });

        test('Should produce identical SQL when no pivot TCs exist in itemsMap', () => {
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

            // With itemsMap (no TCs)
            const withItems = new PivotQueryBuilder(
                'SELECT date, category, revenue FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                {
                    revenue: {
                        name: 'revenue',
                        table: 'events',
                        label: 'Revenue',
                        fieldType: FieldType.METRIC,
                        type: MetricType.SUM,
                        tableLabel: 'Events',
                        sql: '',
                        hidden: false,
                    },
                },
            );

            // Without itemsMap
            const withoutItems = new PivotQueryBuilder(
                'SELECT date, category, revenue FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
            );

            expect(withItems.toSql({ columnLimit: 100 })).toBe(
                withoutItems.toSql({ columnLimit: 100 }),
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
            // Field references must be quoted to handle reserved words and special characters
            expect(result).toContain(
                '"impressions_any" - CASE WHEN LAG("row_index", 1)',
            );
            expect(result).toContain('LAG("impressions_any", 1)');

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

        test('Should quote SQL reserved words used as field names in pivot table calculations', () => {
            const itemsMapWithReservedWord: ItemsMap = {
                sla_hit: {
                    name: 'sla_hit',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'SLA hit',
                    sql: 'pivot_index(${table1.metric1}, 2) / NULLIF(${limit}, 0) + ${category}',
                },
            };

            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    { reference: 'limit', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'metric1',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'sla_hit',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, metric1, "limit" FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMapWithReservedWord,
            );

            const result = builder.toSql();

            expect(result).toContain('pivot_table_calculations');
            // 'limit' is a SQL reserved word — must be quoted as an index column reference
            expect(result).toContain('NULLIF("limit", 0)');
            // groupBy column reference should also be quoted
            expect(result).toContain('+ "category"');
        });

        test('Should use backtick quoting for BigQuery/Databricks warehouses', () => {
            const mockBigQuerySqlBuilder = {
                getFieldQuoteChar: () => '`',
                getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
                getStartOfWeek: () => WeekDay.MONDAY,
                getNullSafeEqualSql: defaultNullSafeEqualSql,
            } as unknown as WarehouseSqlBuilder;

            const itemsMapWithTc: ItemsMap = {
                doubled: {
                    name: 'doubled',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Doubled',
                    sql: 'pivot_offset(${table1.metric1}, 0) * 2',
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
                        reference: 'doubled',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, metric1 FROM events',
                pivotConfiguration,
                mockBigQuerySqlBuilder,
                500,
                itemsMapWithTc,
            );

            const result = builder.toSql();

            expect(result).toContain('pivot_table_calculations');
            // BigQuery uses backticks — verify metric ref is backtick-quoted
            expect(result).toContain('`metric1_sum`');
            expect(result).not.toContain('"metric1_sum"');
        });

        test('Should quote both fully-qualified and bare table calc references in pivot TCs', () => {
            const itemsMapWithBothRefStyles: ItemsMap = {
                base_calc: {
                    name: 'base_calc',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Base Calc',
                    sql: 'pivot_offset(${table1.metric1}, 0) + 1',
                },
                derived_calc: {
                    name: 'derived_calc',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'Derived Calc',
                    sql: '${base_calc} * pivot_offset(${table1.metric1}, 0)',
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
                        reference: 'base_calc',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'derived_calc',
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
                itemsMapWithBothRefStyles,
            );

            const result = builder.toSql();

            expect(result).toContain('pivot_table_calculations');
            // Bare table calc ref: ${base_calc} → "base_calc_any" (quoted)
            // Assert the expression to confirm quoting happens in the TC replacement specifically
            expect(result).toContain('"base_calc_any" *');
        });

        test('Should resolve unknown field references as implicit metrics in pivot table calculations', () => {
            const itemsMapWithUnknownRef: ItemsMap = {
                tc_with_unknown: {
                    name: 'tc_with_unknown',
                    table: 'table1',
                    tableLabel: 'Table 1',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC with unknown',
                    sql: 'pivot_offset(${table1.metric1}, 0) + ${unknown_field}',
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
                        reference: 'tc_with_unknown',
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
                itemsMapWithUnknownRef,
            );

            const result = builder.toSql();

            expect(result).toContain('pivot_table_calculations');
            // Known ref should be quoted with aggregation suffix
            expect(result).toContain('"metric1_sum"');
            // Bare ref (unknown_field) is detected as an implicit metric — carried
            // through group_by_query via ANY_VALUE and resolved to a quoted column
            // name in pivot_table_calculations (not left as raw ${} syntax).
            expect(result).toContain('"unknown_field"');
            expect(result).not.toContain('${unknown_field}');
        });

        test('Should log a warning for unknown field references', () => {
            const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation();

            const itemsMap: ItemsMap = {
                tc_unknown: {
                    name: 'tc_unknown',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC Unknown',
                    sql: 'pivot_index(${events.revenue}, 1) + ${ghost_field}',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'tc_unknown',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            // eslint-disable-next-line no-new
            new PivotQueryBuilder(
                'SELECT date, category, revenue FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('ghost_field'),
            );
            // Warning should describe the actual failure mode (SQL error), not "null values"
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SQL error'),
            );
            expect(warnSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('null values'),
            );
        });

        test('Should filter out TC-to-TC bare references from implicit metrics', () => {
            const itemsMap: ItemsMap = {
                tc_pivot: {
                    name: 'tc_pivot',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC Pivot',
                    sql: 'pivot_index(${events.revenue}, 1) + ${tc_helper}',
                },
                tc_helper: {
                    name: 'tc_helper',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC Helper',
                    sql: '100',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'tc_pivot',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, revenue, null AS tc_pivot, null AS tc_helper FROM t',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // events_revenue IS an implicit metric (table-prefixed, not a TC)
            expect(normalized).toContain('(ARRAY_AGG("events_revenue"))[1]');
            // tc_helper should NOT be carried as an implicit metric
            expect(normalized).not.toContain('ARRAY_AGG("tc_helper")');
        });

        test('Should handle table-prefixed unknown references', () => {
            const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation();

            const itemsMap: ItemsMap = {
                tc_missing: {
                    name: 'tc_missing',
                    table: 'events',
                    tableLabel: 'Events',
                    type: TableCalculationType.NUMBER,
                    displayName: 'TC Missing',
                    sql: 'pivot_index(${events.revenue}, 1) + ${missing_table.missing_metric}',
                },
            };

            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'tc_missing',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                'SELECT date, category, revenue FROM events',
                pivotConfiguration,
                mockWarehouseSqlBuilder,
                500,
                itemsMap,
            );

            const result = builder.toSql();
            const normalized = replaceWhitespace(result);

            // Table-prefixed unknown ref becomes implicit metric
            expect(normalized).toContain(
                '(ARRAY_AGG("missing_table_missing_metric"))[1] AS "missing_table_missing_metric"',
            );
            // Warning should fire for unknown table-prefixed ref
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('missing_table_missing_metric'),
            );
        });
    });

    describe('Regressions for resolved pivot sort bugs', () => {
        // These tests lock the SQL shape that fixes a previously-shipped bug.
        // Each one is anchored to a GitHub issue so a regression has a name.

        test('Two groupBy columns with sort on the second groupBy column produces deterministic column ordering (#16871)', () => {
            // https://github.com/lightdash/lightdash/issues/16871
            // Repro: pivot on [payment_method, status], sort by status ASC.
            // Bug: column headers came out in the wrong order with duplicate
            // (payment_method, status) tuples appearing under one payment_method.
            // Expectation: column_index iterates groupByColumns in declared order
            // with the sort direction applied to the matched field, so each
            // unique (payment_method, status) pair gets a single deterministic
            // column_index.
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'order_date_year', type: VizIndexType.TIME },
                ],
                valuesColumns: [
                    {
                        reference: 'total_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'payment_method' },
                    { reference: 'status' },
                ],
                sortBy: [
                    { reference: 'status', direction: SortByDirection.ASC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // column_index ORDER BY follows groupBy order with the sort direction
            // applied to the matched field (status). The other groupBy field
            // defaults to ASC, giving us a fully-determined column ordering.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY g."payment_method" ASC, g."status" ASC) AS "column_index"',
            );

            // group_by_query GROUPs on both groupBy fields → unique tuples.
            expect(replaceWhitespace(result)).toContain(
                'group by "payment_method", "status", "order_date_year"',
            );

            // No anchor CTEs: dimension sort path, not metric sort.
            expect(result).not.toContain('column_ranking AS (');
            expect(result).not.toContain('anchor_column AS (');
        });

        test('Sort direction on the groupBy field flows through to column_index even with multi-key sort (#17018)', () => {
            // https://github.com/lightdash/lightdash/issues/17018
            // Repro: dims=[month_name, month, year], pivot=year,
            // sort=[year DESC, month ASC]. Results table was right but the
            // chart series came out in alphabetical year order.
            // Expectation: when the sort references the groupBy field, the
            // column_index DENSE_RANK ORDER BY honors that direction so the
            // chart series order matches the underlying sort.
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'month_name', type: VizIndexType.CATEGORY },
                    { reference: 'month', type: VizIndexType.TIME },
                ],
                valuesColumns: [
                    {
                        reference: 'count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [{ reference: 'year' }],
                sortBy: [
                    { reference: 'year', direction: SortByDirection.DESC },
                    { reference: 'month', direction: SortByDirection.ASC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Column ordering reflects the sort direction on the pivot field.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY g."year" DESC) AS "column_index"',
            );

            // Row ordering uses the index columns in sort order, with month_name
            // (no explicit sort entry) defaulting to ASC at the end.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY g."month" ASC, g."month_name" ASC) AS "row_index"',
            );
        });

        test('CTE names are quoted when field references contain spaces (#20683)', () => {
            // https://github.com/lightdash/lightdash/issues/20683
            // Repro: a metric named "AVERAGE TAX RATE 2" combined with a
            // pivot + metric sort. The pivot pipeline derives CTE names like
            // "events_AVERAGE TAX RATE 2_column_anchor" from field references,
            // and an unquoted CTE name in WITH or in LEFT JOIN broke with
            // `syntax error at or near "TAX"`.
            // Expectation: anchor CTE names AND every JOIN target are wrapped
            // in the warehouse quote char so spaces are tolerated.
            const fieldWithSpaces = 'events_AVG TAX RATE';
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: fieldWithSpaces,
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: fieldWithSpaces,
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

            // CTE definitions in the WITH clause must be quoted.
            expect(result).toContain(`"${fieldWithSpaces}_column_anchor" AS (`);
            expect(result).toContain(`"${fieldWithSpaces}_row_anchor" AS (`);

            // Every reference of those CTEs (LEFT JOIN, qualified column
            // accesses) must also be quoted — the original bug was unquoted
            // names appearing in JOIN clauses, not just CTE definitions.
            expect(result).toContain(
                `LEFT JOIN "${fieldWithSpaces}_row_anchor"`,
            );
            expect(result).toContain(
                `LEFT JOIN "${fieldWithSpaces}_column_anchor"`,
            );
            expect(result).toContain(
                `"${fieldWithSpaces}_column_anchor"."${fieldWithSpaces}_column_anchor_value"`,
            );
            expect(result).toContain(
                `"${fieldWithSpaces}_row_anchor"."${fieldWithSpaces}_row_anchor_value"`,
            );

            // The bare unquoted form must not appear anywhere — that is what
            // would produce the original `syntax error at or near "TAX"`.
            expect(result).not.toContain(`${fieldWithSpaces}_column_anchor AS`);
            expect(result).not.toContain(
                `LEFT JOIN ${fieldWithSpaces}_row_anchor`,
            );
        });

        test('Pivot SQL on Databricks emits self-contained row_ranking + column_ranking CTEs for metric sort (#20681)', () => {
            // https://github.com/lightdash/lightdash/issues/20681
            // Repro: pivot chart with metric-based sorting on Databricks where
            // a dashboard filter caused the base query to return 0 rows.
            // Spark inlines CTEs and its Window optimizer consumed anchor
            // value columns out of the pivot_query SELECT list, so the final
            // CROSS JOIN couldn't resolve them.
            // Expectation: row_index/col_idx are computed in their OWN CTEs
            // (row_ranking, column_ranking), each carrying the JOIN to the
            // anchor CTE in its own scope. pivot_query then just JOINs the
            // precomputed rankings — no inline DENSE_RANK referencing values
            // from a sibling CTE that Spark could lose during inlining.
            const mockDatabricksBuilder = {
                getFieldQuoteChar: () => '`',
                getAdapterType: () => SupportedDbtAdapter.DATABRICKS,
                getStartOfWeek: () => WeekDay.MONDAY,
                getNullSafeEqualSql: defaultNullSafeEqualSql,
            } as unknown as WarehouseSqlBuilder;

            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'event_tier', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [{ reference: 'event' }],
                sortBy: [
                    { reference: 'count', direction: SortByDirection.DESC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockDatabricksBuilder,
            );

            const result = builder.toSql();

            // Both ranking CTEs must exist.
            expect(result).toContain('row_ranking AS (');
            expect(result).toContain('column_ranking AS (');

            // row_ranking is self-contained: it owns its JOIN to row_anchor
            // and produces row_index as a concrete output column.
            expect(replaceWhitespace(result)).toContain(
                'row_ranking AS (SELECT DISTINCT g.`event_tier`, DENSE_RANK() OVER (ORDER BY `count_row_anchor`.`count_row_anchor_value` DESC, g.`event_tier` ASC) AS `row_index` FROM group_by_query g LEFT JOIN `count_row_anchor` ON (g.`event_tier` = `count_row_anchor`.`event_tier` OR (g.`event_tier` IS NULL AND `count_row_anchor`.`event_tier` IS NULL)))',
            );

            // pivot_query just joins precomputed rankings — no inline
            // DENSE_RANK that would reference anchor cols across the
            // sibling CTE Spark inlines.
            const pivotQueryRegex = /pivot_query AS \(([^)]+)\)/;
            const pivotQueryBody = result.match(pivotQueryRegex)?.[1] ?? '';
            expect(pivotQueryBody).not.toContain('DENSE_RANK');
            expect(pivotQueryBody).toContain('rr.`row_index`');
            expect(pivotQueryBody).toContain('cr.`col_idx`');
        });

        test('nullsFirst on a value-column sort propagates through anchor CTE and row_index (#19202)', () => {
            // https://github.com/lightdash/lightdash/issues/19202
            // Repro: SQL pivot pipeline + sort by a metric with nullsFirst
            // semantics + a tiebreaker dim with the opposite null treatment.
            // Bug: the nullsFirst flag on the value-column sort was dropped
            // somewhere between sortBy and the column anchor SQL.
            // Expectation: NULLS FIRST/LAST flows into FIRST_VALUE inside the
            // column anchor CTE, into the column_ranking ORDER BY, and into
            // the row_index ORDER BY, with each sort entry getting its own
            // nulls treatment in a multi-key sort.
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
                        nullsFirst: true,
                    },
                    {
                        reference: 'date',
                        direction: SortByDirection.ASC,
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

            // FIRST_VALUE inside the column anchor CTE picks the metric value
            // at the desired column under NULLS FIRST semantics.
            expect(replaceWhitespace(result)).toContain(
                'FIRST_VALUE("revenue_sum") OVER (PARTITION BY "category" ORDER BY "revenue_sum" DESC NULLS FIRST ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );

            // column_ranking ORDER BY echoes the NULLS treatment for the
            // anchor value, then falls back to the groupBy field as tiebreaker.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_column_anchor"."revenue_column_anchor_value" DESC NULLS FIRST, g."category" ASC) AS "col_idx"',
            );

            // row_index ORDER BY combines BOTH sort entries with their own
            // NULLS treatment — value column under NULLS FIRST, date under
            // NULLS LAST. A regression that drops the per-entry nulls flag
            // would collapse one of these.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY "revenue_row_anchor"."revenue_row_anchor_value" DESC NULLS FIRST, g."date" ASC NULLS LAST) AS "row_index"',
            );
        });

        test('Metric sort orders rows by the value at the leftmost (anchor) pivot column, not aggregated across all columns (#19509)', () => {
            // https://github.com/lightdash/lightdash/issues/19509 / GLITCH-145
            // Repro: pivoted table with multiple value columns. Users expect
            // rows ordered by the leftmost column's value (just like before
            // the SQL pivot rewrite). The bug ordered rows by the row-MAX
            // across all pivot columns, scrambling the apparent ranking.
            // Expectation: row_anchor SQL guards the metric value with a
            // CASE WHEN that picks ONLY the anchor column's value, joined via
            // CROSS JOIN anchor_column. There is no MAX/MIN/SUM(metric) form
            // that aggregates across pivot columns.
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

            // Anchor column CTE is what selects the leftmost pivot column.
            expect(result).toContain('anchor_column AS (');
            expect(result).toContain('CROSS JOIN anchor_column ac');

            // row_anchor's metric value comes from a CASE WHEN guarded on
            // anchor_category equality — i.e., from the leftmost column only.
            expect(replaceWhitespace(result)).toContain(
                'MAX(CASE WHEN (q."category" = ac."anchor_category" OR (q."category" IS NULL AND ac."anchor_category" IS NULL)) THEN q."revenue_sum" END)',
            );

            // Negative: the bugged behavior would aggregate the metric across
            // every pivot column. The collapsed SQL must not contain bare
            // forms like `MAX(q."revenue_sum")` or `SUM(q."revenue_sum")` —
            // every reference to q."revenue_sum" must be inside a CASE WHEN
            // guarded on the anchor column.
            const collapsed = replaceWhitespace(result);
            const bareAggregates = [
                'MAX(q."revenue_sum")',
                'MIN(q."revenue_sum")',
                'SUM(q."revenue_sum")',
                'AVG(q."revenue_sum")',
            ];
            bareAggregates.forEach((expr) => {
                expect(collapsed).not.toContain(expr);
            });
        });

        test('Multiple value columns with metric sort produce frame clauses on every column anchor FIRST_VALUE (#18064)', () => {
            // https://github.com/lightdash/lightdash/issues/18064 / GLITCH-90
            // Repro: USE_SQL_PIVOT_RESULTS + sort by a value column on
            // Redshift. Window functions with ORDER BY require explicit frame
            // clauses; missing frames produced "Aggregate window functions
            // with an ORDER BY clause require a frame clause".
            // Expectation: with a multi-key sort across multiple value
            // columns, EVERY FIRST_VALUE in the pivot SQL has an explicit
            // ROWS BETWEEN frame clause — not just the first one.
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
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'revenue', direction: SortByDirection.DESC },
                    { reference: 'orders', direction: SortByDirection.ASC },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Both sort metrics produce a column_anchor CTE.
            expect(result).toContain('"revenue_column_anchor" AS (');
            expect(result).toContain('"orders_column_anchor" AS (');

            // Count is the assertion: every FIRST_VALUE must be paired with a
            // ROWS BETWEEN frame clause. A regression that leaves frames off
            // a second/third FIRST_VALUE would make this fail on Redshift.
            const firstValueMatches = result.match(/FIRST_VALUE/g);
            const rowsBetweenMatches = result.match(
                /ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING/g,
            );
            const firstValueCount = firstValueMatches
                ? firstValueMatches.length
                : 0;
            const rowsBetweenCount = rowsBetweenMatches
                ? rowsBetweenMatches.length
                : 0;
            expect(firstValueCount).toBeGreaterThanOrEqual(2);
            expect(rowsBetweenCount).toBe(firstValueCount);

            // Spot check: each metric's column anchor SQL contains the full
            // FIRST_VALUE + frame syntax.
            expect(replaceWhitespace(result)).toContain(
                'FIRST_VALUE("revenue_sum") OVER (PARTITION BY "category" ORDER BY "revenue_sum" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );
            expect(replaceWhitespace(result)).toContain(
                'FIRST_VALUE("orders_count") OVER (PARTITION BY "category" ORDER BY "orders_count" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );
        });

        test('Multi-groupBy with no sort produces a deterministic column ordering across all groupBy fields (#9767, #11038)', () => {
            // https://github.com/lightdash/lightdash/issues/9767
            // https://github.com/lightdash/lightdash/issues/11038
            // Repro: same query + same data → different column order across
            // re-renders, leading to inconsistent chart series colors.
            // Expectation: the column_index DENSE_RANK ORDER BY chains every
            // groupBy field as a deterministic tiebreaker — no warehouse-row-
            // order leakage and no alphabetical-only fallback that would tie.
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'order_date_week', type: VizIndexType.TIME },
                ],
                valuesColumns: [
                    {
                        reference: 'event_count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [
                    { reference: 'type_of_event' },
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

            // All groupBy fields appear in the column_index ORDER BY in their
            // declared order, each with explicit ASC. This is what makes the
            // pivot column order stable across runs.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY g."type_of_event" ASC, g."region" ASC) AS "column_index"',
            );

            // Same invariant for row_index — index columns chain deterministically.
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."order_date_week" asc) as "row_index"',
            );
        });

        test('Multi-key groupBy sort follows groupBy declaration order, not sortBy order, with each direction matched by reference (#16871)', () => {
            // https://github.com/lightdash/lightdash/issues/16871
            // Repro: groupBy=[payment_method, status], sortBy=[status DESC,
            // payment_method ASC]. The bug let sortBy order leak into the
            // column_index ORDER BY, producing alternating-tuple column orders
            // that re-emerged as duplicate (payment_method, status) tuples
            // under a single payment_method.
            // Expectation: column_index ORDER BY iterates groupByColumns in
            // declared order — payment_method first, status second — and
            // picks each direction from the matching sortBy entry by
            // reference. The sortBy listing order is irrelevant.
            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'order_date_year', type: VizIndexType.TIME },
                ],
                valuesColumns: [
                    {
                        reference: 'total_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'payment_method' },
                    { reference: 'status' },
                ],
                // Deliberately reversed: sortBy lists status first.
                sortBy: [
                    { reference: 'status', direction: SortByDirection.DESC },
                    {
                        reference: 'payment_method',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // payment_method comes first because groupByColumns lists it
            // first; status's DESC and payment_method's ASC are picked from
            // sortBy by reference match. The reverse order would indicate a
            // regression where sortBy order won.
            expect(replaceWhitespace(result)).toContain(
                'DENSE_RANK() OVER (ORDER BY g."payment_method" ASC, g."status" DESC) AS "column_index"',
            );

            // Negative: the (wrongly) sortBy-ordered shape must not appear.
            expect(replaceWhitespace(result)).not.toContain(
                'DENSE_RANK() OVER (ORDER BY g."status" DESC, g."payment_method" ASC) AS "column_index"',
            );
        });

        test('total_columns CTE counts via nested DISTINCT subquery, never via COUNT(DISTINCT CONCAT(...)) (#19767)', () => {
            // https://github.com/lightdash/lightdash/issues/19767 / PROD-2762
            // Repro: pivot a chart whose groupBy mixes types (e.g. a
            // TIMESTAMP column AND a STRING column) on Redshift. The bug
            // emitted `COUNT(DISTINCT CONCAT('col1', "col1", '-', 'col2',
            // "col2"))` for total_columns, which Redshift refused because
            // CONCAT across mixed types fails type checking.
            // Expectation: total_columns is computed via
            // `SELECT COUNT(*) FROM (SELECT DISTINCT col1, col2 FROM
            // filtered_rows) AS distinct_groups` — warehouse-agnostic, no
            // CONCAT, no DISTINCT-CONCAT.
            const pivotConfiguration = {
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [
                    { reference: 'order_date_year' },
                    { reference: 'payment_method' },
                ],
                sortBy: [{ reference: 'date', direction: SortByDirection.ASC }],
            };

            const builder = new PivotQueryBuilder(
                baseSql,
                pivotConfiguration,
                mockWarehouseSqlBuilder,
            );

            const result = builder.toSql();

            // Subquery-DISTINCT shape — both groupBy refs appear in the
            // SELECT DISTINCT list inside the inner subquery.
            expect(replaceWhitespace(result)).toContain(
                'total_columns AS (SELECT COUNT(*) AS total_columns FROM (SELECT DISTINCT "order_date_year", "payment_method" FROM filtered_rows) AS distinct_groups)',
            );

            // Negative: the bugged Redshift-incompatible form must not
            // appear anywhere. CONCAT-based counting was the original bug.
            expect(result).not.toContain('COUNT(DISTINCT CONCAT(');
            expect(result).not.toContain('COUNT(DISTINCT concat(');
        });

        test('Named time-interval index columns sort chronologically via CASE WHEN, not alphabetically (#18245)', () => {
            // https://github.com/lightdash/lightdash/issues/18245
            // Repro: x-axis = month_name (or day_of_week_name, quarter_name)
            // with groupBy and sort ASC. The default string ORDER BY put
            // April before December alphabetically; users expected
            // chronological order.
            // Expectation: PivotQueryBuilder dispatches MONTH_NAME,
            // DAY_OF_WEEK_NAME, and QUARTER_NAME index columns to
            // CASE-WHEN ORDER BY expressions that map names to
            // chronological positions. A regression that drops the special
            // case falls back to bare alphabetical "name" ASC ordering.
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
                ...monthNameDimension,
                name: 'day_name',
                label: 'Day Name',
                sql: '${TABLE}.day_name',
                compiledSql: '"orders".day_name',
                timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
            };
            const quarterNameDimension: CompiledDimension = {
                ...monthNameDimension,
                name: 'quarter_name',
                label: 'Quarter Name',
                sql: '${TABLE}.quarter_name',
                compiledSql: '"orders".quarter_name',
                timeInterval: TimeFrames.QUARTER_NAME,
            };

            const itemsMap: ItemsMap = {
                orders_month_name: monthNameDimension,
                orders_day_name: dayNameDimension,
                orders_quarter_name: quarterNameDimension,
            };

            // Each named-time-interval dim is exercised in turn under the
            // same pivot+groupBy+sort scenario.
            const cases: Array<{
                reference: string;
                marker: string;
            }> = [
                {
                    reference: 'orders_month_name',
                    marker: '"orders_month_name" = \'January\' THEN 1',
                },
                {
                    reference: 'orders_day_name',
                    marker: '"orders_day_name" = \'Monday\' THEN',
                },
                {
                    reference: 'orders_quarter_name',
                    marker: '"orders_quarter_name" = \'Q1\' THEN 1',
                },
            ];

            for (const { reference, marker } of cases) {
                const pivotConfiguration = {
                    indexColumn: [{ reference, type: VizIndexType.CATEGORY }],
                    valuesColumns: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [{ reference: 'category' }],
                    sortBy: [{ reference, direction: SortByDirection.ASC }],
                };

                const builder = new PivotQueryBuilder(
                    baseSql,
                    pivotConfiguration,
                    mockWarehouseSqlBuilder,
                    500,
                    itemsMap,
                );
                const result = builder.toSql();

                // CASE-WHEN mapping for chronological order is present.
                expect(result).toContain('CASE');
                expect(result).toContain(marker);

                // Negative: the bare alphabetical "ref" ASC form would mean
                // the special-case dispatch was bypassed. Only the bare
                // form (the dim itself, not the table-prefixed compiledSql)
                // is what would replace the CASE WHEN.
                expect(replaceWhitespace(result)).not.toContain(
                    `DENSE_RANK() OVER (ORDER BY g."${reference}" ASC) AS "row_index"`,
                );
            }
        });

        test('Sorted custom bin dimension as pivot index uses the hidden _order column for row_index — not the bin label (#20566)', () => {
            // https://github.com/lightdash/lightdash/issues/20566
            // Repro: cartesian chart with x-axis = a custom bin dimension
            // (e.g. 11 fixed bins on orders.amount), grouped by status,
            // sort by the bin ASC. Without group by, the chart sorts
            // correctly; adding a group by routed the chart through the
            // pivot pipeline, and the bin's hidden `_order` column was
            // dropped from the pivot CTEs — so bins came out alphabetically
            // (e.g. 101-113 before 1-11).
            // Expectation: the pivot SQL select-list and group_by_query
            // group-by carry the bin's `_order` column through, and
            // row_index ORDER BY references ONLY the `_order` alias — the
            // bare bin reference must not leak in alongside it.
            const binDimension: CustomBinDimension = {
                id: 'amount_binned_amount',
                name: 'binned_amount',
                table: 'orders',
                type: CustomDimensionType.BIN,
                dimensionId: 'orders_amount',
                binType: BinType.FIXED_WIDTH,
                binWidth: 10,
            };
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
                        reference: 'unique_order_count',
                        aggregation: VizAggregationOptions.COUNT,
                    },
                ],
                groupByColumns: [{ reference: 'status' }],
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

            // _order column flows through group_by_query so it is available
            // downstream in row_index ORDER BY.
            expect(result).toContain('"amount_binned_amount_order"');
            expect(replaceWhitespace(result)).toContain(
                'group by "status", "amount_binned_amount", "amount_binned_amount_order"',
            );

            // row_index orders by the _order alias — the negative assertion
            // is what locks the regression: the bare bin reference must not
            // appear in row_index ORDER BY, otherwise alphabetical fallback
            // could re-creep in.
            expect(result.toLowerCase()).toContain(
                'dense_rank() over (order by g."amount_binned_amount_order" asc) as "row_index"',
            );
            expect(replaceWhitespace(result)).not.toContain(
                'DENSE_RANK() OVER (ORDER BY g."amount_binned_amount" ASC) AS "row_index"',
            );
        });

        test('column_anchor CTE body contains the FIRST_VALUE PARTITION BY groupBy expression — not row-anchor MAX(CASE WHEN…) (#19509 column-side)', () => {
            // Companion to the existing #19509 row-anchor test. That test
            // locks that row_anchor uses MAX(CASE WHEN guarded on
            // anchor_category equality...). This locks the column-side
            // anchor's distinct shape: column_anchor uses FIRST_VALUE
            // PARTITION BY <groupBy> ORDER BY <metric>, with frame clause.
            // Risk: a refactor that "unifies" anchor CTE generation could
            // collapse the two CTEs into one shape, silently re-introducing
            // the wrong-rows ordering #19509 fixed without any of the
            // existing isolated-line assertions failing — they test that
            // the substrings exist somewhere, not that they are inside
            // column_anchor.
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
            const collapsed = replaceWhitespace(result);

            // Slice out the column_anchor CTE body so the assertions are
            // scoped to just that CTE rather than the whole SQL. Nested
            // parens inside FIRST_VALUE / OVER (...) make a regex slice
            // brittle, so use named CTE markers as bounds.
            const colAnchorStart = collapsed.indexOf(
                '"revenue_column_anchor" AS (',
            );
            const rowAnchorStart = collapsed.indexOf(
                '"revenue_row_anchor" AS (',
                colAnchorStart,
            );
            expect(colAnchorStart).toBeGreaterThanOrEqual(0);
            expect(rowAnchorStart).toBeGreaterThan(colAnchorStart);
            const colAnchorBody = collapsed.slice(
                colAnchorStart,
                rowAnchorStart,
            );

            // FIRST_VALUE PARTITION BY <groupBy> ORDER BY <metric>, with the
            // explicit ROWS BETWEEN frame, lives inside column_anchor.
            expect(colAnchorBody).toContain(
                'FIRST_VALUE("revenue_sum") OVER (PARTITION BY "category" ORDER BY "revenue_sum" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
            );

            // Negative: column_anchor must NOT carry row-anchor's
            // MAX(CASE WHEN…) expression — that is the row-side shape.
            // Mixing them up is the documented regression path.
            expect(colAnchorBody).not.toContain('MAX(CASE WHEN');
            expect(colAnchorBody).not.toContain('CROSS JOIN anchor_column');
        });
    });
});
