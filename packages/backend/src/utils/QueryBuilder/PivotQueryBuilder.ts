import {
    getAggregatedField,
    isDimension,
    isField,
    normalizeIndexColumns,
    ParameterError,
    SortByDirection,
    TimeFrames,
    VizSortBy,
    WarehouseSqlBuilder,
    type CompiledDimension,
    type ItemsMap,
    type PivotConfiguration,
} from '@lightdash/common';
import {
    applyLimitToSqlQuery,
    sortDayOfWeekName,
    sortMonthName,
    sortQuarterName,
} from './utils';

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

    private readonly itemsMap: ItemsMap;

    /**
     * Creates a new PivotQueryBuilder instance.
     * @param sql - The base SQL query to transform
     * @param pivotConfiguration - Configuration defining how to pivot the data
     * @param warehouseSqlBuilder - Database-specific SQL builder for proper quoting and syntax
     * @param limit - Optional row limit for the result set (defaults to 500)
     * @param itemsMap - Map of field references to field metadata for resolving time intervals
     */
    constructor(
        sql: string,
        pivotConfiguration: PivotConfiguration,
        warehouseSqlBuilder: WarehouseSqlBuilder,
        limit?: number,
        itemsMap?: ItemsMap,
    ) {
        this.sql = sql;
        this.pivotConfiguration = pivotConfiguration;
        this.limit = limit;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
        this.itemsMap = itemsMap ?? {};
    }

    /**
     * Resolves sort field reference to SQL expression.
     * For name-based time intervals, returns CASE statement for chronological order.
     * @param reference Field reference from sortBy
     * @param descending Sort direction
     * @returns SQL sort expression
     */
    private resolveSortField(reference: string, descending: boolean): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const field = this.itemsMap[reference];

        if (!field || !isDimension(field)) {
            return `${q}${reference}${q}${descending ? ' DESC' : ' ASC'}`;
        }

        const startOfWeek = this.warehouseSqlBuilder.getStartOfWeek();

        switch (field.timeInterval) {
            case TimeFrames.MONTH_NAME:
                return sortMonthName(field, q, descending);
            case TimeFrames.DAY_OF_WEEK_NAME:
                return sortDayOfWeekName(field, startOfWeek, q, descending);
            case TimeFrames.QUARTER_NAME:
                return sortQuarterName(field, q, descending);
            default:
                return `${q}${reference}${q}${descending ? ' DESC' : ' ASC'}`;
        }
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
        columnLimit: number,
    ): number {
        const valueColumnsCount = valuesColumns?.length || 1;
        const remainingColumns = columnLimit - 1; // Account for the index column
        return Math.floor(remainingColumns / valueColumnsCount);
    }

    /**
     * Generates ORDER BY clause from sort configuration.
     * @param sortBy - Sort configuration with column references and directions
     * @returns ORDER BY SQL clause or empty string if no sorting
     */
    private getOrderBySQL(sortBy: PivotConfiguration['sortBy']): string {
        if (!sortBy?.length) return '';

        return `ORDER BY ${sortBy
            .map((s) =>
                this.resolveSortField(
                    s.reference,
                    s.direction === SortByDirection.DESC,
                ),
            )
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
    static getValueColumnFieldName(
        reference: string,
        aggregation: string,
    ): string {
        return `${reference}_${aggregation}`;
    }

    /**
     * Builds ORDER BY clause for groupBy columns with their sort directions.
     * Respects sortBy order and uses column anchor values for value columns when available.
     * Appends any missing group by columns at the end.
     * @param groupByColumns - Group by columns to order by
     * @param valuesColumns - Value columns configuration
     * @param sortBy - Sort configuration for columns
     * @param metricFirstValueQueries - Map of CTE names to their definitions
     * @param q - Quote character for field names
     * @returns ORDER BY clause string for groupBy columns
     */
    private buildGroupByOrderBy(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        sortBy: PivotConfiguration['sortBy'],
        metricFirstValueQueries: Record<
            string,
            { cteName: string; sql: string }
        >,
        q: string,
    ): string {
        const orderByParts: string[] = [];

        if (sortBy) {
            const isValueColumn = (sort: VizSortBy | undefined) =>
                valuesColumns?.some(
                    (valCol) => valCol.reference === sort?.reference,
                );

            const isGroupByColumn = ({ reference }: VizSortBy) =>
                groupByColumns.some(
                    (groupCol) => groupCol.reference === reference,
                );

            // Create values order parts
            const valuesOrderByParts = sortBy
                .filter(isValueColumn)
                .reduce<string[]>((acc, sort) => {
                    const sortDirection =
                        sort.direction === SortByDirection.DESC
                            ? ' DESC'
                            : ' ASC';
                    // Use column anchor value for value columns
                    const colAnchorCteName = `${sort.reference}_column_anchor`;

                    // todo: current SQL does not work with value sorting and multiple group columns
                    if (
                        groupByColumns.length === 1 &&
                        metricFirstValueQueries[colAnchorCteName]
                    ) {
                        acc.push(
                            `${colAnchorCteName}.${q}${colAnchorCteName}_value${q}${sortDirection}`,
                        );
                    }
                    return acc;
                }, []);

            // Create groups order parts. Note that groups parts should follow the groupsByColumns order rather than sortBy order.
            const groupsOrderByParts = groupByColumns.map((col) => {
                const sort = sortBy.find((s) => s.reference === col.reference);
                const sortExpr = this.resolveSortField(
                    col.reference,
                    sort?.direction === SortByDirection.DESC,
                );
                // Prefix with g. table alias
                return sortExpr.replaceAll(
                    `${q}${col.reference}${q}`,
                    `g.${q}${col.reference}${q}`,
                );
            });

            // Order parts cannot have values and groups interleaved. We have to ensure they are together by type
            const sortByValuesFirst = isValueColumn(
                sortBy.find((s) => isValueColumn(s) || isGroupByColumn(s)),
            );
            if (sortByValuesFirst) {
                orderByParts.push(...valuesOrderByParts, ...groupsOrderByParts);
            } else {
                orderByParts.push(...groupsOrderByParts, ...valuesOrderByParts);
            }
        } else {
            // Default to all groupBy columns with ASC direction
            groupByColumns.forEach((col) => {
                orderByParts.push(`g.${q}${col.reference}${q} ASC`);
            });
        }

        return orderByParts.join(', ');
    }

    /**
     * Builds ORDER BY clause for row_index calculation.
     * Maintains sort order from sortBy configuration and includes value columns.
     * When a value column is referenced, uses the anchor value from metric first value CTEs.
     *
     * @param indexColumns - Normalized index columns
     * @param valuesColumns - Value columns configuration
     * @param sortBy - Sort configuration for all columns
     * @param metricFirstValueQueries - Map of value column references to their CTE info
     * @param q - Quote character for field names
     * @returns ORDER BY clause string for row index ordering
     */
    private buildRowIndexOrderBy(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        sortBy: PivotConfiguration['sortBy'],
        metricFirstValueQueries: Record<
            string,
            { cteName: string; sql: string }
        >,
        q: string,
    ): string {
        if (!sortBy?.length) {
            // Default to all index columns with ASC direction
            return indexColumns
                .map((col) => `g.${q}${col.reference}${q} ASC`)
                .join(', ');
        }

        const orderByParts: string[] = [];

        // Process sortBy in order to maintain the specified sort priority
        for (const sort of sortBy) {
            const sortDirection =
                sort.direction === SortByDirection.DESC ? ' DESC' : ' ASC';

            // Check if this sort is for an index column
            const isIndexColumn = indexColumns.some(
                (indexCol) => indexCol.reference === sort.reference,
            );

            // Check if this is a value column
            const isValueColumn = valuesColumns?.some(
                (valCol) => valCol.reference === sort.reference,
            );

            if (isValueColumn) {
                // Use the anchor value from the row anchor CTE
                const rowAnchorCteName = `${sort.reference}_row_anchor`;
                if (metricFirstValueQueries[rowAnchorCteName]) {
                    orderByParts.push(
                        `${rowAnchorCteName}.${q}${rowAnchorCteName}_value${q}${sortDirection}`,
                    );
                }
            } else if (isIndexColumn) {
                // Only include index columns in row ordering
                const sortExpr = this.resolveSortField(
                    sort.reference,
                    sort.direction === SortByDirection.DESC,
                );
                // Prefix with g. table alias
                const prefixedExpr = sortExpr.replaceAll(
                    `${q}${sort.reference}${q}`,
                    `g.${q}${sort.reference}${q}`,
                );
                orderByParts.push(prefixedExpr);
            }
            // Skip other column types (like groupBy columns) as they shouldn't affect row ordering
        }

        // Ensure all index columns are included for proper dense_rank calculation
        // Add any missing index columns that weren't in sortBy
        const sortedReferences = new Set(sortBy.map((s) => s.reference));
        for (const indexCol of indexColumns) {
            if (!sortedReferences.has(indexCol.reference)) {
                const sortExpr = this.resolveSortField(
                    indexCol.reference,
                    false,
                );
                const prefixedExpr = sortExpr.replaceAll(
                    `${q}${indexCol.reference}${q}`,
                    `g.${q}${indexCol.reference}${q}`,
                );
                orderByParts.push(prefixedExpr);
            }
        }

        return orderByParts.join(', ');
    }

    /**
     * Generates SQL CTEs for calculating anchor values for value columns that have sorts.
     * Creates two CTEs per value column that appears in sortBy configuration:
     * 1. Row anchor CTE - partitioned by index columns for row ordering
     * 2. Column anchor CTE - partitioned by group columns for column ordering
     *
     * @param indexColumns - Normalized index columns for partitioning
     * @param valuesColumns - Value columns configuration
     * @param groupByColumns - Group by columns for partitioning
     * @param sortBy - Sort configuration to identify which value columns need anchor values
     * @returns Record mapping CTE names to their SQL definitions
     */
    private getMetricFirstValueSQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): Record<string, { cteName: string; sql: string }> {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const result: Record<string, { cteName: string; sql: string }> = {};

        if (!valuesColumns || !sortBy) {
            return result;
        }

        // Find value columns that have sorts defined
        valuesColumns.forEach((valCol) => {
            const sortConfig = sortBy.find(
                (sort) => sort.reference === valCol.reference,
            );
            if (!sortConfig) return;

            const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                valCol.reference,
                valCol.aggregation,
            );
            const sortDirection =
                sortConfig.direction === SortByDirection.DESC ? 'DESC' : 'ASC';

            // Create row anchor CTE (partitioned by index columns)
            const rowAnchorCteName = `${valCol.reference}_row_anchor`;
            const indexColumnReferences = indexColumns
                .map((col) => `${q}${col.reference}${q}`)
                .join(', ');

            const rowAnchorSql = `SELECT DISTINCT ${indexColumnReferences}, FIRST_VALUE(${q}${fieldName}${q}) OVER (PARTITION BY ${indexColumnReferences} ORDER BY ${q}${fieldName}${q} ${sortDirection} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS ${q}${rowAnchorCteName}_value${q} FROM group_by_query`;

            result[rowAnchorCteName] = {
                cteName: rowAnchorCteName,
                sql: rowAnchorSql,
            };

            // Create column anchor CTE (partitioned by group columns)
            const colAnchorCteName = `${valCol.reference}_column_anchor`;
            const groupColumnReferences = groupByColumns
                .map((col) => `${q}${col.reference}${q}`)
                .join(', ');

            const colAnchorSql = `SELECT DISTINCT ${groupColumnReferences}, FIRST_VALUE(${q}${fieldName}${q}) OVER (PARTITION BY ${groupColumnReferences} ORDER BY ${q}${fieldName}${q} ${sortDirection} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS ${q}${colAnchorCteName}_value${q} FROM group_by_query`;

            result[colAnchorCteName] = {
                cteName: colAnchorCteName,
                sql: colAnchorSql,
            };
        });

        return result;
    }

    /**
     * Generates the pivot query CTE that adds row and column indexes.
     * Joins with metric first value CTEs when value columns are used for sorting.
     * @param indexColumns - Columns used as row identifiers
     * @param valuesColumns - Aggregated value columns
     * @param groupByColumns - Columns to pivot into separate columns
     * @param sortBy - Sort configuration for row ordering
     * @param metricFirstValueQueries - Map of value column references to their CTE info
     * @returns SQL for the pivot_query CTE with ranking columns
     */
    private getPivotQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
        metricFirstValueQueries: Record<
            string,
            { cteName: string; sql: string }
        >,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Build base table and joins
        let fromClause = 'group_by_query g';
        const joins: string[] = [];

        // Add joins for metric first value CTEs
        Object.values(metricFirstValueQueries).forEach(({ cteName }) => {
            if (cteName.endsWith('_row_anchor')) {
                // Join on index columns for row anchor CTEs
                const joinConditions = indexColumns
                    .map(
                        (col) =>
                            `g.${q}${col.reference}${q} = ${cteName}.${q}${col.reference}${q}`,
                    )
                    .join(' AND ');
                joins.push(`JOIN ${cteName} ON ${joinConditions}`);
            } else if (cteName.endsWith('_column_anchor')) {
                // Join on group columns for column anchor CTEs
                const joinConditions = groupByColumns
                    .map(
                        (col) =>
                            `g.${q}${col.reference}${q} = ${cteName}.${q}${col.reference}${q}`,
                    )
                    .join(' AND ');
                joins.push(`JOIN ${cteName} ON ${joinConditions}`);
            }
        });

        if (joins.length > 0) {
            fromClause += ` ${joins.join(' ')}`;
        }

        const selectReferences = [
            ...indexColumns.map((col) => `g.${q}${col.reference}${q}`),
            ...groupByColumns.map((col) => `g.${q}${col.reference}${q}`),
            ...(valuesColumns || []).map((col) => {
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                return `g.${q}${fieldName}${q}`;
            }),
        ];

        // Build ORDER BY for row_index - should only consider index columns, not groupBy columns
        const rowIndexOrderBy = this.buildRowIndexOrderBy(
            indexColumns,
            valuesColumns,
            sortBy,
            metricFirstValueQueries,
            q,
        );

        const groupByOrderBy = this.buildGroupByOrderBy(
            groupByColumns,
            valuesColumns,
            sortBy,
            metricFirstValueQueries,
            q,
        );

        return `SELECT ${selectReferences.join(
            ', ',
        )}, DENSE_RANK() OVER (ORDER BY ${rowIndexOrderBy}) AS ${q}row_index${q}, DENSE_RANK() OVER (ORDER BY ${groupByOrderBy}) AS ${q}column_index${q} FROM ${fromClause}`;
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
        columnLimit: number | undefined,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const rowLimit = this.limit ?? DEFAULT_PIVOT_ROW_LIMIT;

        const metricFirstValueQueries = this.getMetricFirstValueSQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
            sortBy,
        );

        const pivotQuery = this.getPivotQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
            sortBy,
            metricFirstValueQueries,
        );

        let maxColumnsPerValueColumnSql = '';

        if (columnLimit) {
            const maxColumnsPerValueColumn =
                PivotQueryBuilder.calculateMaxColumnsPerValueColumn(
                    valuesColumns,
                    columnLimit,
                );

            // Keep leading space to avoid SQL syntax errors
            maxColumnsPerValueColumnSql = ` and p.${q}column_index${q} <= ${maxColumnsPerValueColumn}`;
        }

        const totalColumnsQuery = this.getTotalColumnsSQL(
            groupByColumns,
            valuesColumns,
            'filtered_rows',
        );

        const ctes = [
            `original_query AS (${userSql})`,
            `group_by_query AS (${groupByQuery})`,
            ...Object.values(metricFirstValueQueries).map(
                ({ cteName, sql }) => `${cteName} AS (${sql})`,
            ),
            `pivot_query AS (${pivotQuery})`,
            `filtered_rows AS (SELECT * FROM pivot_query WHERE ${q}row_index${q} <= ${rowLimit})`,
            `total_columns AS (${totalColumnsQuery})`,
        ];

        const finalSelect = `SELECT p.*, t.total_columns FROM pivot_query p CROSS JOIN total_columns t WHERE p.${q}row_index${q} <= ${rowLimit}${maxColumnsPerValueColumnSql} order by p.${q}row_index${q}, p.${q}column_index${q}`;

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

    private getBaseSql(): string {
        // Remove limit and trailing semicolon from base SQL
        return applyLimitToSqlQuery({
            sqlQuery: this.sql,
            limit: null,
        }).replace(/;\s*$/, '');
    }

    /**
     * Generates the final pivot SQL query.
     * @param columnLimit - Maximum number of columns to generate for the pivot query
     * @returns Complete SQL query with CTEs for pivoting the data
     * @throws {ParameterError} If no index columns are provided
     */
    toSql(opts?: { columnLimit: number }): string {
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

        // Validate that no groupBy column is also part of the index columns
        if (groupByColumns && groupByColumns.length > 0) {
            const indexRefs = new Set(indexColumns.map((c) => c.reference));
            const overlapping = groupByColumns
                .map((c) => c.reference)
                .filter((ref) => indexRefs.has(ref));
            if (overlapping.length > 0) {
                // Throw a clear parameter error listing the offending columns
                throw new ParameterError(
                    `Group column(s) cannot also be part of the index column(s): ${overlapping.join(
                        ', ',
                    )}`,
                );
            }
        }

        const baseSql = this.getBaseSql();
        const groupByQuery = this.getGroupByQuerySQL(
            indexColumns,
            valuesColumns,
            groupByColumns,
        );

        if (groupByColumns && groupByColumns.length > 0) {
            const { columnLimit } = opts ?? {};
            return this.getFullPivotSQL(
                baseSql,
                groupByQuery,
                indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
                columnLimit,
            );
        }

        return this.getSimpleQuerySQL(baseSql, groupByQuery, sortBy);
    }
}
