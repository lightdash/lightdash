import {
    getAggregatedField,
    MAX_PIVOT_COLUMN_LIMIT,
    normalizeIndexColumns,
    ParameterError,
    type PivotConfiguration,
    SortByDirection,
    WarehouseSqlBuilder,
} from '@lightdash/common';

const DEFAULT_PIVOT_ROW_LIMIT = 500;

/**
 * Generates SQL queries for pivoting tabular data with aggregations.
 *
 * Supports two modes:
 * 1. Simple aggregation - Groups by index columns and aggregates values
 * 2. Full pivot - Groups by additional columns to spread values across multiple columns
 *    (e.g., transforming rows of categories into separate columns for each category)
 */
export class PivotQueryBuilder {
    private readonly sql: string;

    private readonly pivotConfiguration: PivotConfiguration;

    private readonly limit: number | undefined;

    private readonly warehouseSqlBuilder: WarehouseSqlBuilder;

    /**
     * Creates a new PivotQueryBuilder instance.
     * @param sql - The base SQL query to transform
     * @param pivotConfiguration - Configuration defining how to pivot the data
     * @param warehouseSqlBuilder - Database-specific SQL builder for proper quoting and syntax
     * @param limit - Optional row limit for the result set (defaults to 500)
     */
    constructor(
        sql: string,
        pivotConfiguration: PivotConfiguration,
        warehouseSqlBuilder: WarehouseSqlBuilder,
        limit?: number,
    ) {
        this.sql = sql;
        this.pivotConfiguration = pivotConfiguration;
        this.limit = limit;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
    }

    /**
     * Builds a WITH clause from an array of CTE definitions.
     * @param ctes - Array of CTE strings (e.g., ["cte1 AS (...)", "cte2 AS (...)"])
     * @returns Complete WITH clause or empty string if no CTEs
     */
    static buildCtesSQL(ctes: string[]): string {
        return ctes.length > 0 ? `WITH ${ctes.join(',\n')}` : '';
    }

    /**
     * Assembles SQL parts into a complete query, filtering out undefined values.
     * @param parts - Array of SQL fragments to join
     * @returns Combined SQL string with newlines between parts
     */
    static assembleSqlParts(parts: Array<string | undefined>): string {
        return parts.filter((part) => part !== undefined).join('\n');
    }

    /**
     * Calculates the maximum number of columns allowed per value column.
     * @param valuesColumns - The value columns configuration
     * @returns Maximum columns per value to stay within pivot column limits
     */
    private static calculateMaxColumnsPerValueColumn(
        valuesColumns: PivotConfiguration['valuesColumns'],
    ): number {
        const valueColumnsCount = valuesColumns?.length || 1;
        const remainingColumns = MAX_PIVOT_COLUMN_LIMIT - 1; // Account for the index column
        return Math.floor(remainingColumns / valueColumnsCount);
    }

    /**
     * Generates ORDER BY clause from sort configuration.
     * @param sortBy - Sort configuration with column references and directions
     * @returns ORDER BY SQL clause or empty string if no sorting
     */
    private getOrderBySQL(sortBy: PivotConfiguration['sortBy']): string {
        if (!sortBy?.length) return '';

        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        return `ORDER BY ${sortBy
            .map((s) => `${q}${s.reference}${q} ${s.direction}`)
            .join(', ')}`;
    }

    /**
     * Generates query that counts total distinct column combinations for pivot.
     * Uses a subquery with SELECT DISTINCT for warehouse-agnostic counting.
     * @param groupByColumns - Columns that are being pivoted
     * @param valuesColumns - Value columns to multiply count by
     * @param filteredRowsTable - Name of the CTE containing filtered rows
     * @returns SQL query for counting total columns
     */
    private getTotalColumnsSQL(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        filteredRowsTable: string,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        // Fallback to 1 when no valuesColumns to ensure at least one column per distinct group
        // This maintains consistent pivot behavior even when only grouping without aggregations
        const valuesCount = valuesColumns?.length || 1;

        return `SELECT COUNT(*) * ${valuesCount} as total_columns FROM (SELECT DISTINCT ${groupByColumns
            .map((col) => `${q}${col.reference}${q}`)
            .join(', ')} FROM ${filteredRowsTable}) as distinct_groups`;
    }

    /**
     * Generates the GROUP BY query CTE that performs aggregations.
     * @param indexColumns - Columns to use as row identifiers
     * @param valuesColumns - Columns to aggregate with their aggregation functions
     * @param groupByColumns - Additional columns to group by for pivoting
     * @returns SQL for the group_by_query CTE
     */
    private getGroupByQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: PivotConfiguration['groupByColumns'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const groupBySelectDimensions = [
            ...(groupByColumns || []).map((col) => `${q}${col.reference}${q}`),
            ...indexColumns.map((col) => `${q}${col.reference}${q}`),
        ];

        const groupBySelectMetrics = [
            ...(valuesColumns ?? []).map((col) => {
                const aggregationField = getAggregatedField(
                    this.warehouseSqlBuilder,
                    col.aggregation,
                    col.reference,
                );
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                return `${aggregationField} AS ${q}${fieldName}${q}`;
            }),
        ];

        return `SELECT ${[
            ...new Set(groupBySelectDimensions), // Remove duplicate columns
            ...groupBySelectMetrics,
        ].join(', ')} FROM original_query group by ${Array.from(
            new Set(groupBySelectDimensions),
        ).join(', ')}`;
    }

    /**
     * Gets the field name with aggregation suffix for value columns.
     * @param reference - The field reference
     * @param aggregation - The aggregation type
     * @returns The field name with aggregation suffix
     */
    private static getValueColumnFieldName(
        reference: string,
        aggregation: string,
    ): string {
        return `${reference}_${aggregation}`;
    }

    /**
     * Builds ORDER BY clause for groupBy columns with their sort directions.
     * @param groupByColumns - Group by columns to order by
     * @param sortBy - Sort configuration for columns
     * @param q - Quote character for field names
     * @returns ORDER BY clause string for groupBy columns
     */
    private static buildGroupByOrderBy(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
        q: string,
    ): string {
        // ! We always need all groupBy columns so that dense_rank() can be used to calculate column_index (calculate all unique combinations of groupBy columns)
        return groupByColumns
            .map((col) => {
                const sortConfig = sortBy?.find(
                    (s) => s.reference === col.reference,
                );

                const sortDirection =
                    sortConfig?.direction === SortByDirection.DESC
                        ? ' DESC'
                        : ' ASC';

                return `${q}${col.reference}${q}${sortDirection}`;
            })
            .join(', ');
    }

    /**
     * Builds ORDER BY clause for row_index calculation.
     * Includes all index columns with sorting directions from sortBy or ASC if not specified.
     *
     * @param indexColumns - Normalized index columns
     * @param sortBy - Sort configuration for all columns
     * @param q - Quote character for field names
     * @returns ORDER BY clause string for row index ordering
     */
    private static buildRowIndexOrderBy(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        sortBy: PivotConfiguration['sortBy'],
        q: string,
    ): string {
        // ! We always need all index columns so that dense_rank() can be used to calculate row_index (calculate all unique combinations of index columns)
        return indexColumns
            .map((col) => {
                const indexColumnSort = sortBy?.find(
                    (sort) => sort.reference === col.reference,
                );

                const sortDirection =
                    indexColumnSort?.direction === SortByDirection.DESC
                        ? ' DESC'
                        : ' ASC';

                return `${q}${col.reference}${q}${sortDirection}`;
            })
            .join(', ');
    }

    /**
     * Generates the pivot query CTE that adds row and column indexes.
     * @param indexColumns - Columns used as row identifiers
     * @param valuesColumns - Aggregated value columns
     * @param groupByColumns - Columns to pivot into separate columns
     * @param sortBy - Sort configuration for row ordering
     * @returns SQL for the pivot_query CTE with ranking columns
     */
    private getPivotQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const selectReferences = [
            ...indexColumns.map((col) => col.reference),
            ...groupByColumns.map((col) => `${q}${col.reference}${q}`),
            ...(valuesColumns || []).map((col) => {
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                return `${q}${fieldName}${q}`;
            }),
        ];

        // Build ORDER BY for row_index - should only consider index columns, not groupBy columns
        const rowIndexOrderBy = PivotQueryBuilder.buildRowIndexOrderBy(
            indexColumns,
            sortBy,
            q,
        );

        const groupByOrderBy = PivotQueryBuilder.buildGroupByOrderBy(
            groupByColumns,
            sortBy,
            q,
        );

        return `SELECT ${selectReferences.join(
            ', ',
        )}, dense_rank() over (order by ${rowIndexOrderBy}) as ${q}row_index${q}, dense_rank() over (order by ${groupByOrderBy}) as ${q}column_index${q} FROM group_by_query`;
    }

    /**
     * Generates complete pivot SQL with all CTEs for grouped pivot.
     * @param userSql - Original user SQL query
     * @param groupByQuery - GROUP BY query SQL
     * @param indexColumns - Index columns for row identification
     * @param valuesColumns - Value columns to aggregate
     * @param groupByColumns - Columns to pivot across
     * @param sortBy - Sort configuration
     * @returns Complete SQL with CTEs for pivoting with grouping
     */
    private getFullPivotSQL(
        userSql: string,
        groupByQuery: string,
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const rowLimit = this.limit ?? DEFAULT_PIVOT_ROW_LIMIT;

        const pivotQuery = this.getPivotQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
            sortBy,
        );
        const maxColumnsPerValueColumn =
            PivotQueryBuilder.calculateMaxColumnsPerValueColumn(valuesColumns);

        const totalColumnsQuery = this.getTotalColumnsSQL(
            groupByColumns,
            valuesColumns,
            'filtered_rows',
        );

        const ctes = [
            `original_query AS (${userSql})`,
            `group_by_query AS (${groupByQuery})`,
            `pivot_query AS (${pivotQuery})`,
            `filtered_rows AS (SELECT * FROM pivot_query WHERE ${q}row_index${q} <= ${rowLimit})`,
            `total_columns AS (${totalColumnsQuery})`,
        ];

        const finalSelect = `SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p.${q}row_index${q} <= ${rowLimit} and p.${q}column_index${q} <= ${maxColumnsPerValueColumn} order by p.${q}row_index${q}, p.${q}column_index${q}`;

        return PivotQueryBuilder.assembleSqlParts([
            PivotQueryBuilder.buildCtesSQL(ctes),
            finalSelect,
        ]);
    }

    /**
     * Generates SQL for simple aggregation without pivoting.
     * @param userSql - Original user SQL query
     * @param groupByQuery - GROUP BY query SQL
     * @param sortBy - Sort configuration
     * @returns SQL with CTEs for simple aggregation
     */
    private getSimpleQuerySQL(
        userSql: string,
        groupByQuery: string,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const orderBy = this.getOrderBySQL(sortBy);
        const ctes = [
            `original_query AS (${userSql})`,
            `group_by_query AS (${groupByQuery})`,
        ];

        return PivotQueryBuilder.assembleSqlParts([
            PivotQueryBuilder.buildCtesSQL(ctes),
            `SELECT * FROM group_by_query${
                orderBy ? ` ${orderBy}` : ''
            } LIMIT ${this.limit ?? DEFAULT_PIVOT_ROW_LIMIT}`,
        ]);
    }

    /**
     * Generates the final pivot SQL query.
     * @returns Complete SQL query with CTEs for pivoting the data
     * @throws {ParameterError} If no index columns are provided
     */
    toSql(): string {
        const indexColumns = normalizeIndexColumns(
            this.pivotConfiguration.indexColumn,
        );
        if (indexColumns.length === 0) {
            throw new ParameterError(
                'At least one valid index column is required',
            );
        }
        const { valuesColumns, groupByColumns, sortBy } =
            this.pivotConfiguration;

        const userSql = this.sql.replace(/;\s*$/, '');
        const groupByQuery = this.getGroupByQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
        );

        if (groupByColumns && groupByColumns.length > 0) {
            return this.getFullPivotSQL(
                userSql,
                groupByQuery,
                indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
            );
        }

        return this.getSimpleQuerySQL(userSql, groupByQuery, sortBy);
    }
}
