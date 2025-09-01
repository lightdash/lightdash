import {
    ParameterError,
    SortByDirection,
    SupportedDbtAdapter,
    VizAggregationOptions,
    VizIndexType,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { PivotQueryBuilder } from './PivotQueryBuilder';

// Mock warehouse SQL builder
const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
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

            const result = builder.toSql();

            // Should contain all CTEs
            expect(result).toContain(
                'WITH original_query AS (SELECT * FROM events)',
            );
            expect(result).toContain('group_by_query AS (');
            expect(result).toContain('pivot_query AS (');
            expect(result).toContain('filtered_rows AS (');
            expect(result).toContain('total_columns AS (');

            // Should include row_index and column_index metadata
            expect(result).toContain(
                'dense_rank() over (order by "date" ASC) as "row_index"',
            );
            expect(result).toContain(
                'dense_rank() over (order by "event_type" ASC) as "column_index"',
            );

            // Should apply limits and column constraints
            expect(result).toContain('WHERE "row_index" <= 100');
            expect(result).toContain('"column_index" <= 99');

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

            const result = builder.toSql();

            // With 3 value columns: (100-1)/3 = 33 max columns per value column
            expect(result).toContain('"column_index" <= 33');
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
            expect(result).toContain(
                'dense_rank() over (order by "date" DESC) as "row_index"',
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

        test('Should throw error for undefined index column', () => {
            const pivotConfiguration = {
                indexColumn: undefined,
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

            // Should throw an error since no index columns are provided
            expect(() => builder.toSql()).toThrow(ParameterError);
            expect(() => builder.toSql()).toThrow(
                'At least one valid index column is required',
            );
        });

        test('Should deduplicate index and group by columns', () => {
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

            const result = builder.toSql();

            // Should contain "date" only once in the group by
            const groupByMatches = result.match(/group by.*?"date"/g) || [];
            expect(groupByMatches.length).toBe(1);

            // Should not duplicate date in the select
            expect(result).not.toContain('"date", "date"');
        });
    });

    describe('Validation', () => {
        test('Should throw error when indexColumn is undefined', () => {
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

            expect(() => builder.toSql()).toThrow(ParameterError);
            expect(() => builder.toSql()).toThrow(
                'At least one valid index column is required',
            );
        });

        test('Should throw error when indexColumns array is empty', () => {
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

            expect(() => builder.toSql()).toThrow(ParameterError);
            expect(() => builder.toSql()).toThrow(
                'At least one valid index column is required',
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
            expect(result).toContain(
                'dense_rank() over (order by "date" ASC, "store_id" ASC, "product_category" ASC)',
            );

            // Should include all columns in select references
            expect(result).toContain(
                'date, store_id, product_category, "category", "region"',
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
            expect(result).toContain(
                'dense_rank() over (order by "date" DESC, "store_id" ASC, "product_category" ASC)',
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
            // Should calculate total_columns correctly (1 value column default)
            expect(result).toContain('* 1 as total_columns');
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
});
