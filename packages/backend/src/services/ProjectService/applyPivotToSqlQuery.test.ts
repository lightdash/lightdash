import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    WarehouseTypes,
    type GroupByColumn,
    type PivotIndexColum,
    type SortBy,
    type ValuesColumn,
} from '@lightdash/common';
import { ProjectService } from './ProjectService';

describe('ProjectService.applyPivotToSqlQuery', () => {
    const baseSql = 'SELECT * FROM sales';
    const mockValuesColumns: ValuesColumn[] = [
        { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
        { reference: 'count', aggregation: VizAggregationOptions.COUNT },
    ];
    const mockGroupByColumns: GroupByColumn[] = [
        { reference: 'category' },
        { reference: 'region' },
    ];

    // Helper function to normalize SQL for comparison (removes extra whitespace)
    const normalizeSql = (sql: string): string =>
        sql
            .replace(/\s+/g, ' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/,\s+/g, ', ')
            .trim();

    describe('single index column (backward compatibility)', () => {
        const singleIndexColumn: PivotIndexColum = {
            reference: 'date',
            type: VizIndexType.TIME,
        };

        it('should generate correct SQL for single index column with PostgreSQL', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should generate correct SQL for single index column with BigQuery', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.BIGQUERY,
                sql: baseSql,
                limit: 50,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: undefined,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                group_by_query AS (SELECT \`date\`, sum(\`revenue\`) AS \`revenue_sum\`, count(\`count\`) AS \`count_count\` FROM original_query group by \`date\`)
                SELECT * FROM group_by_query LIMIT 50`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should handle sorting for single index column', () => {
            const sortBy: SortBy = [
                { reference: 'date', direction: SortByDirection.DESC },
                { reference: 'revenue', direction: SortByDirection.ASC },
            ];

            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" DESC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should throw error when indexColumn is undefined', () => {
            expect(() => {
                ProjectService.applyPivotToSqlQuery({
                    warehouseType: WarehouseTypes.POSTGRES,
                    sql: baseSql,
                    limit: 100,
                    indexColumn: undefined,
                    valuesColumns: mockValuesColumns,
                    groupByColumns: mockGroupByColumns,
                    sortBy: undefined,
                });
            }).toThrow('At least one valid index column is required');
        });
    });

    describe('multiple index columns (new functionality)', () => {
        const multipleIndexColumns: PivotIndexColum[] = [
            { reference: 'date', type: VizIndexType.TIME },
            { reference: 'store_id', type: VizIndexType.CATEGORY },
            { reference: 'product_category', type: VizIndexType.CATEGORY },
        ];

        it('should generate correct SQL for multiple index columns with PostgreSQL', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: multipleIndexColumns,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", "store_id", "product_category", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date", "store_id", "product_category"),
                 pivot_query AS (SELECT date, store_id, product_category, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC, "store_id" ASC, "product_category" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should generate correct SQL for multiple index columns with BigQuery', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.BIGQUERY,
                sql: baseSql,
                limit: 200,
                indexColumn: multipleIndexColumns,
                valuesColumns: mockValuesColumns,
                groupByColumns: undefined,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                group_by_query AS (SELECT \`date\`, \`store_id\`, \`product_category\`, sum(\`revenue\`) AS \`revenue_sum\`, count(\`count\`) AS \`count_count\` FROM original_query group by \`date\`, \`store_id\`, \`product_category\`)
                SELECT * FROM group_by_query LIMIT 200`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should handle mixed sorting for multiple index columns', () => {
            const sortBy: SortBy = [
                { reference: 'date', direction: SortByDirection.DESC },
                { reference: 'store_id', direction: SortByDirection.ASC },
                { reference: 'revenue', direction: SortByDirection.DESC },
            ];

            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: multipleIndexColumns,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", "store_id", "product_category", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date", "store_id", "product_category"),
                 pivot_query AS (SELECT date, store_id, product_category, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" DESC, "store_id" ASC, "product_category" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should handle partial sorting (only some index columns have sort directions)', () => {
            const sortBy: SortBy = [
                { reference: 'date', direction: SortByDirection.DESC },
                // store_id and product_category will default to ASC
            ];

            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: multipleIndexColumns,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", "store_id", "product_category", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date", "store_id", "product_category"),
                 pivot_query AS (SELECT date, store_id, product_category, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" DESC, "store_id" ASC, "product_category" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should throw error when indexColumns array is empty', () => {
            expect(() => {
                ProjectService.applyPivotToSqlQuery({
                    warehouseType: WarehouseTypes.POSTGRES,
                    sql: baseSql,
                    limit: 100,
                    indexColumn: [],
                    valuesColumns: mockValuesColumns,
                    groupByColumns: mockGroupByColumns,
                    sortBy: undefined,
                });
            }).toThrow('At least one valid index column is required');
        });
    });

    describe('warehouse type compatibility', () => {
        const singleIndexColumn: PivotIndexColum = {
            reference: 'date',
            type: VizIndexType.TIME,
        };

        it('should use correct quote characters for Snowflake', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.SNOWFLAKE,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should use correct quote characters for Redshift', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.REDSHIFT,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should use correct quote characters for Databricks', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.DATABRICKS,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT \`category\`, \`region\`, \`date\`, sum(\`revenue\`) AS \`revenue_sum\`, count(\`count\`) AS \`count_count\` FROM original_query group by \`category\`, \`region\`, \`date\`),
                 pivot_query AS (SELECT date, \`category\`, \`region\`, \`revenue_sum\`, \`count_count\`, dense_rank() over (order by \`date\` ASC) as \`row_index\`, dense_rank() over (order by \`category\`) as \`column_index\` FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE \`row_index\` <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows.\`category\`, filtered_rows.\`region\`) * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p.\`row_index\` <= 100 and p.\`column_index\` <= 49 order by p.\`row_index\`, p.\`column_index\``;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });
    });

    describe('edge cases', () => {
        const singleIndexColumn: PivotIndexColum = {
            reference: 'date',
            type: VizIndexType.TIME,
        };

        it('should handle empty values columns', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: [],
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 1) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 99 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should handle undefined limit (should default to 500)', () => {
            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: undefined,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: mockGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 500 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 500 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });

        it('should remove duplicate columns from group by dimensions', () => {
            const duplicateGroupByColumns: GroupByColumn[] = [
                { reference: 'category' },
                { reference: 'category' }, // duplicate
                { reference: 'region' },
            ];

            const result = ProjectService.applyPivotToSqlQuery({
                warehouseType: WarehouseTypes.POSTGRES,
                sql: baseSql,
                limit: 100,
                indexColumn: singleIndexColumn,
                valuesColumns: mockValuesColumns,
                groupByColumns: duplicateGroupByColumns,
                sortBy: undefined,
            });

            const expectedSql = `WITH original_query AS (SELECT * FROM sales),
                 group_by_query AS (SELECT "category", "region", "date", sum("revenue") AS "revenue_sum", count("count") AS "count_count" FROM original_query group by "category", "region", "date"),
                 pivot_query AS (SELECT date, "category", "category", "region", "revenue_sum", "count_count", dense_rank() over (order by "date" ASC) as "row_index", dense_rank() over (order by "category") as "column_index" FROM group_by_query),
                 filtered_rows AS ( SELECT * FROM pivot_query WHERE "row_index" <= 100 ),
                 total_columns AS ( SELECT (COUNT(DISTINCT filtered_rows."category", filtered_rows."category", filtered_rows."region") * 2) as total_columns FROM filtered_rows )
            SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p."row_index" <= 100 and p."column_index" <= 49 order by p."row_index", p."column_index"`;

            expect(normalizeSql(result)).toBe(normalizeSql(expectedSql));
        });
    });
});
