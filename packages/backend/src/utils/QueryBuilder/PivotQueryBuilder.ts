import {
    getAggregatedField,
    getItemId,
    getParsedReference,
    hasPivotFunctions,
    isCustomBinDimension,
    isDimension,
    isSqlTableCalculation,
    isTableCalculation,
    lightdashVariablePattern,
    normalizeIndexColumns,
    OTHER_GROUP_SENTINEL_VALUE,
    ParameterError,
    parseTableCalculationFunctions,
    snakeCaseName,
    SortByDirection,
    TableCalculationFunctionCompiler,
    TimeFrames,
    VizAggregationOptions,
    VizSortBy,
    WarehouseSqlBuilder,
    type GroupLimitConfig,
    type ItemsMap,
    type PivotConfiguration,
    type TableCalculation,
    type ValuesColumn,
} from '@lightdash/common';
import {
    type PivotSourceContract,
    type PivotSourceMetricInput,
} from './MetricQueryBuilder';
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

    private readonly pivotTableCalculations: Record<string, TableCalculation>;

    private readonly pivotSource?: PivotSourceContract;

    private readonly rawOtherEnabled: boolean;

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
        pivotSource?: PivotSourceContract,
        rawOtherEnabled: boolean = false,
    ) {
        this.sql = sql;
        this.pivotConfiguration = pivotConfiguration;
        this.limit = limit;
        this.warehouseSqlBuilder = warehouseSqlBuilder;
        this.itemsMap = itemsMap ?? {};
        this.pivotSource = pivotSource;
        this.rawOtherEnabled = rawOtherEnabled;
        this.pivotTableCalculations = this.identifyPivotTableCalculations();
    }

    /**
     * Identifies table calculations that contain pivot functions.
     * @returns Record of table calculations keyed by their ID that use pivot functions
     */
    private identifyPivotTableCalculations(): Record<string, TableCalculation> {
        return Object.values(this.itemsMap).reduce<
            Record<string, TableCalculation>
        >((acc, item) => {
            // Only include if there are pivot functions
            if (
                isTableCalculation(item) &&
                isSqlTableCalculation(item) &&
                hasPivotFunctions(parseTableCalculationFunctions(item.sql))
            ) {
                const tcId = getItemId(item);
                acc[tcId] = item;
            }
            return acc;
        }, {});
    }

    /**
     * Returns the set of column references that are both custom bin dimensions
     * AND have a sort entry in pivotConfiguration.sortBy.
     * MetricQueryBuilder always generates an `_order` column for bin dimensions,
     * but we only carry it through the pivot query when the bin is actively sorted.
     */
    private getSortedBinDimensionReferences(
        columns: Array<{ reference: string }>,
    ): Set<string> {
        const sortedRefs = new Set(
            this.pivotConfiguration.sortBy?.map((s) => s.reference) ?? [],
        );
        const result = new Set<string>();
        for (const col of columns) {
            if (
                sortedRefs.has(col.reference) &&
                isCustomBinDimension(this.itemsMap[col.reference])
            ) {
                result.add(col.reference);
            }
        }
        return result;
    }

    /**
     * Replaces `"reference"` with `alias."reference"` in a sort expression.
     * For custom bin dimensions, also replaces `"reference_order"` with `alias."reference_order"`.
     */
    private prefixSortExprWithAlias(
        sortExpr: string,
        reference: string,
        alias: string,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        let result = sortExpr.replaceAll(
            `${q}${reference}${q}`,
            `${alias}.${q}${reference}${q}`,
        );
        if (isCustomBinDimension(this.itemsMap[reference])) {
            result = result.replaceAll(
                `${q}${reference}_order${q}`,
                `${alias}.${q}${reference}_order${q}`,
            );
        }
        return result;
    }

    /**
     * Returns the SQL NULLS FIRST/LAST clause based on the nullsFirst flag.
     * @param nullsFirst Whether to sort nulls first (undefined means no clause)
     * @returns SQL clause string (' NULLS FIRST', ' NULLS LAST', or '')
     */
    static getNullsFirstLast(nullsFirst: boolean | undefined): string {
        if (nullsFirst === undefined) return '';
        return nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
    }

    /**
     * Resolves sort field reference to SQL expression.
     * For name-based time intervals, returns CASE statement for chronological order.
     * @param reference Field reference from sortBy
     * @param descending Sort direction
     * @param nullsFirst Whether to sort nulls first (undefined means no NULLS clause)
     * @returns SQL sort expression
     */
    private resolveSortField(
        reference: string,
        descending: boolean,
        nullsFirst?: boolean,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const field = this.itemsMap[reference];
        const nullsClause = PivotQueryBuilder.getNullsFirstLast(nullsFirst);

        // Custom bin dimensions use a separate _order column for numeric sorting.
        // MetricQueryBuilder always generates _order, but we only use it for
        // ORDER BY in the pivot query when the dimension is explicitly sorted.
        if (field && isCustomBinDimension(field)) {
            const isSorted = this.pivotConfiguration.sortBy?.some(
                (s) => s.reference === reference,
            );
            if (isSorted) {
                return `${q}${reference}_order${q}${
                    descending ? ' DESC' : ' ASC'
                }${nullsClause}`;
            }
        }

        if (!field || !isDimension(field)) {
            return `${q}${reference}${q}${
                descending ? ' DESC' : ' ASC'
            }${nullsClause}`;
        }

        const startOfWeek = this.warehouseSqlBuilder.getStartOfWeek();

        switch (field.timeInterval) {
            case TimeFrames.MONTH_NAME:
                return sortMonthName(field, q, descending) + nullsClause;
            case TimeFrames.DAY_OF_WEEK_NAME:
                return (
                    sortDayOfWeekName(field, startOfWeek, q, descending) +
                    nullsClause
                );
            case TimeFrames.QUARTER_NAME:
                return sortQuarterName(field, q, descending) + nullsClause;
            default:
                return `${q}${reference}${q}${
                    descending ? ' DESC' : ' ASC'
                }${nullsClause}`;
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
     * @param columnLimit - Maximum total columns allowed
     * @param metricsAsRows - When true, metrics are rows (not columns), so don't divide by valueColumnsCount
     * @returns Maximum columns per value to stay within pivot column limits
     */
    private static calculateMaxColumnsPerValueColumn(
        valuesColumns: PivotConfiguration['valuesColumns'],
        columnLimit: number,
        metricsAsRows?: boolean,
    ): number {
        // When metricsAsRows is true, metrics become rows instead of columns,
        // so we don't need to divide by valueColumnsCount.
        // This matches the frontend legacy pivot calculation behavior.
        if (metricsAsRows) {
            return columnLimit;
        }

        // Default: divide by value columns count (SQL runner and Explorer without metricsAsRows)
        const valueColumnsCount = valuesColumns?.length || 1;
        return Math.floor(columnLimit / valueColumnsCount);
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
                    s.nullsFirst,
                ),
            )
            .join(', ')}`;
    }

    /**
     * Generates query that counts total distinct column combinations for pivot.
     * Uses a subquery with SELECT DISTINCT for warehouse-agnostic counting.
     * @param groupByColumns - Columns that are being pivoted
     * @param valuesColumns - Value columns to multiply count by (only when metricsAsRows is false)
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

        // Use subquery with SELECT DISTINCT to count unique column combinations
        // This approach works across all warehouses without type casting issues
        const columnRefs = groupByColumns
            .map((col) => `${q}${col.reference}${q}`)
            .join(', ');

        // When metricsAsRows is true, metrics become rows (not columns),
        // so we don't multiply by valuesCount
        const shouldMultiplyByValues =
            !this.pivotConfiguration.metricsAsRows && valuesCount > 1;
        const multiplier = shouldMultiplyByValues ? ` * ${valuesCount}` : '';

        return `SELECT COUNT(*)${multiplier} AS total_columns FROM (SELECT DISTINCT ${columnRefs} FROM ${filteredRowsTable}) AS distinct_groups`;
    }

    private getTotalGroupsSQL(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sourceTable: string,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const columnRefs = groupByColumns
            .map((col) => `${q}${col.reference}${q}`)
            .join(', ');

        return `SELECT COUNT(*) AS total_groups FROM (SELECT DISTINCT ${columnRefs} FROM ${sourceTable}) AS distinct_groups`;
    }

    private static getGroupingMode(
        groupLimit: GroupLimitConfig | undefined,
        groupByColumns: PivotConfiguration['groupByColumns'],
        valuesColumns: PivotConfiguration['valuesColumns'],
        pivotSource?: PivotSourceContract,
        rawOtherEnabled?: boolean,
    ): 'raw_other' | 'fast_other' | 'drop' | 'none' {
        if (
            !groupLimit?.enabled ||
            !groupByColumns ||
            groupByColumns.length === 0 ||
            !Number.isFinite(groupLimit.maxGroups)
        ) {
            return 'none';
        }

        if (rawOtherEnabled) {
            if (!pivotSource) {
                return 'drop';
            }

            const allSupported = valuesColumns.every(
                (col) => pivotSource.metricInputs[col.reference] !== undefined,
            );
            return allSupported ? 'raw_other' : 'drop';
        }

        const hasUnsupported = valuesColumns.some(
            (col) => col.otherAggregation === null,
        );
        return hasUnsupported ? 'drop' : 'fast_other';
    }

    private getGroupRankingCTEs(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        maxGroups: number,
    ): string[] {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const groupByRefs = groupByColumns.map(
            (col) => `${q}${col.reference}${q}`,
        );

        const rankingMetric =
            valuesColumns.length > 0
                ? PivotQueryBuilder.getValueColumnFieldName(
                      valuesColumns[0].reference,
                      valuesColumns[0].aggregation,
                  )
                : null;

        const rankingExpr = rankingMetric
            ? `SUM(ABS(${q}${rankingMetric}${q}))`
            : 'COUNT(*)';

        const groupTotalsCTE = `__group_totals AS (SELECT ${groupByRefs.join(', ')}, ${rankingExpr} AS __ranking_value FROM pre_group_by GROUP BY ${groupByRefs.join(', ')})`;

        const tiebreaker = groupByRefs.join(' ASC, ');
        const groupRankingCTE = `__group_ranking AS (SELECT ${groupByRefs.join(', ')}, ROW_NUMBER() OVER (ORDER BY __ranking_value DESC NULLS LAST, ${tiebreaker} ASC) AS __group_rn FROM __group_totals)`;

        return [groupTotalsCTE, groupRankingCTE];
    }

    private getNullSafeJoinConditions(
        leftAlias: string,
        rightAlias: string,
        columns: Array<{ reference: string }>,
    ): string[] {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        return columns.map(
            (col) =>
                `( ${leftAlias}.${q}${col.reference}${q} = ${rightAlias}.${q}${col.reference}${q} OR ( ${leftAlias}.${q}${col.reference}${q} IS NULL AND ${rightAlias}.${q}${col.reference}${q} IS NULL ) )`,
        );
    }

    private getRawOtherMetricAggregationSql(
        metricInput: PivotSourceMetricInput,
        tableAlias: string,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        switch (metricInput.strategy) {
            case 'simple':
                switch (metricInput.aggregateWith) {
                    case 'COUNT_STAR':
                        return 'COUNT(*)';
                    case 'COUNT':
                    case 'SUM':
                    case 'MIN':
                    case 'MAX':
                    case 'AVG':
                        return `${metricInput.aggregateWith}(${tableAlias}.${q}${metricInput.inputAlias}${q})`;
                    default:
                        throw new ParameterError(
                            'Unsupported raw Other aggregation',
                        );
                }
            case 'count_distinct':
                return `COUNT(DISTINCT ${tableAlias}.${q}${metricInput.inputAlias}${q})`;
            case 'distinct_dedup':
                return `${metricInput.aggregateWith}(${tableAlias}.${q}${metricInput.inputAlias}${q})`;
            default:
                throw new ParameterError('Unsupported raw Other metric input');
        }
    }

    /**
     * Generates CTEs for the raw_other grouping mode, which re-aggregates from
     * the raw (unaggregated) source data to produce correct "Other" group values
     * for all metric types, including non-additive ones like COUNT_DISTINCT and AVERAGE.
     *
     * CTE dependency chain:
     *   __pre_group_scope   — distinct (groupBy + index) combos from pre_group_by
     *       ↓
     *   pivot_source        — raw unaggregated data from MetricQueryBuilder's pivotSource query
     *       ↓
     *   scoped_source       — pivot_source filtered to only relevant dimension buckets
     *       ↓
     *   bucketed_source     — top N groups keep their value; the rest get the sentinel value
     *       ↓
     *   __bucketed_groups   — distinct (groupBy + index) from bucketed_source with order columns
     *       ↓
     *   __raw_other_simple_metrics  — SUM/COUNT/MIN/MAX/COUNT(DISTINCT) on bucketed_source
     *       ↓
     *   __dd_<metric>       — one CTE per distinct_dedup metric (ROW_NUMBER dedup + aggregate)
     *       ↓
     *   group_by_query      — LEFT JOINs __bucketed_groups with all metric CTEs → final result
     */
    private getRawOtherCtes(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        maxGroups: number,
    ): string[] {
        if (!this.pivotSource) {
            return [];
        }

        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const floatType = this.warehouseSqlBuilder.getFloatingType();
        const bucketColumns = [...groupByColumns, ...indexColumns];
        const bucketColumnRefs = bucketColumns.map(
            (col) => `${q}${col.reference}${q}`,
        );
        const sortedBinRefs = Array.from(
            this.getSortedBinDimensionReferences([
                ...groupByColumns,
                ...indexColumns,
            ]),
        );

        const preGroupScopeCte = `__pre_group_scope AS (SELECT DISTINCT ${bucketColumnRefs.join(', ')} FROM pre_group_by)`;
        const pivotSourceCte = `pivot_source AS (${this.pivotSource.query})`;
        const scopedSourceCte = `scoped_source AS (SELECT ps.* FROM pivot_source ps INNER JOIN __pre_group_scope s ON ${this.getNullSafeJoinConditions(
            'ps',
            's',
            bucketColumns,
        ).join(' AND ')})`;

        const bucketedSelects = [
            ...groupByColumns.map(
                (col) =>
                    `CASE WHEN gr.__group_rn <= ${maxGroups} THEN CAST(ss.${q}${col.reference}${q} AS TEXT) ELSE '${OTHER_GROUP_SENTINEL_VALUE}' END AS ${q}${col.reference}${q}`,
            ),
            ...indexColumns.map((col) => `ss.${q}${col.reference}${q}`),
            ...sortedBinRefs.map((ref) => `ss.${q}${ref}_order${q}`),
            ...valuesColumns.flatMap((col) => {
                const metricInput =
                    this.pivotSource?.metricInputs[col.reference];
                if (!metricInput) {
                    return [];
                }
                const metricSelects = [
                    `ss.${q}${metricInput.inputAlias}${q} AS ${q}${metricInput.inputAlias}${q}`,
                ];
                if (metricInput.strategy === 'distinct_dedup') {
                    metricSelects.push(
                        ...metricInput.distinctKeyAliases.map(
                            (alias) =>
                                `ss.${q}${alias}${q} AS ${q}${alias}${q}`,
                        ),
                    );
                }
                return metricSelects;
            }),
        ];

        const bucketedSourceCte = `bucketed_source AS (SELECT ${bucketedSelects.join(
            ', ',
        )} FROM scoped_source ss LEFT JOIN __group_ranking gr ON ${this.getNullSafeJoinConditions(
            'ss',
            'gr',
            groupByColumns,
        ).join(' AND ')})`;

        const bucketedGroupsCte = `__bucketed_groups AS (SELECT ${[
            ...bucketColumnRefs,
            ...sortedBinRefs.map(
                (ref) => `MIN(${q}${ref}_order${q}) AS ${q}${ref}_order${q}`,
            ),
        ].join(', ')} FROM bucketed_source GROUP BY ${bucketColumnRefs.join(
            ', ',
        )})`;

        const simpleMetricColumns = valuesColumns.filter((col) => {
            const metricInput = this.pivotSource?.metricInputs[col.reference];
            return (
                metricInput?.strategy === 'simple' ||
                metricInput?.strategy === 'count_distinct'
            );
        });

        const simpleMetricsCte =
            simpleMetricColumns.length > 0
                ? `__raw_other_simple_metrics AS (SELECT ${[
                      ...bucketColumnRefs,
                      ...simpleMetricColumns.map((col) => {
                          const metricInput =
                              this.pivotSource!.metricInputs[col.reference];
                          const fieldName =
                              PivotQueryBuilder.getValueColumnFieldName(
                                  col.reference,
                                  col.aggregation,
                              );
                          return `${this.getRawOtherMetricAggregationSql(
                              metricInput,
                              'b',
                          )} AS ${q}${fieldName}${q}`;
                      }),
                  ].join(
                      ', ',
                  )} FROM bucketed_source b GROUP BY ${bucketColumnRefs.join(
                      ', ',
                  )})`
                : undefined;

        const distinctDedupMetrics = valuesColumns.filter(
            (col) =>
                this.pivotSource?.metricInputs[col.reference]?.strategy ===
                'distinct_dedup',
        );

        const distinctDedupCtes = distinctDedupMetrics.map((col) => {
            const metricInput = this.pivotSource!.metricInputs[
                col.reference
            ] as Extract<
                PivotSourceMetricInput,
                { strategy: 'distinct_dedup' }
            >;
            const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                col.reference,
                col.aggregation,
            );
            const cteName = `__dd_${snakeCaseName(fieldName)}`;
            const ddPartitionBy = [
                ...bucketColumnRefs,
                ...metricInput.distinctKeyAliases.map(
                    (alias) => `${q}${alias}${q}`,
                ),
            ].join(', ');
            const ddInnerSql = `SELECT ${[
                ...bucketColumnRefs,
                `${q}${metricInput.inputAlias}${q} AS __dd_val`,
                `ROW_NUMBER() OVER (PARTITION BY ${ddPartitionBy} ORDER BY ${q}${metricInput.inputAlias}${q}) AS __dd_rn`,
            ].join(', ')} FROM bucketed_source`;
            const ddAggregateSql =
                metricInput.aggregateWith === 'AVG'
                    ? `CAST(SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) AS ${floatType}) / CAST(NULLIF(COUNT(CASE WHEN __dd_rn = 1 THEN __dd_val END), 0) AS ${floatType})`
                    : `SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END)`;
            return `${cteName} AS (SELECT ${[
                ...bucketColumnRefs,
                `${ddAggregateSql} AS ${q}${fieldName}${q}`,
            ].join(
                ', ',
            )} FROM (${ddInnerSql}) ${q}${cteName}_sub${q} GROUP BY ${bucketColumnRefs.join(
                ', ',
            )})`;
        });

        const metricJoinConditions = (alias: string) =>
            this.getNullSafeJoinConditions('g', alias, bucketColumns).join(
                ' AND ',
            );

        const groupByQueryCte = `group_by_query AS (SELECT ${[
            ...bucketColumnRefs.map((ref) => `g.${ref}`),
            ...sortedBinRefs.map((ref) => `g.${q}${ref}_order${q}`),
            ...simpleMetricColumns.map((col) => {
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                return `sm.${q}${fieldName}${q}`;
            }),
            ...distinctDedupMetrics.map((col) => {
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                const cteName = `__dd_${snakeCaseName(fieldName)}`;
                return `${cteName}.${q}${fieldName}${q}`;
            }),
        ].join(', ')} FROM __bucketed_groups g${
            simpleMetricsCte
                ? ` LEFT JOIN __raw_other_simple_metrics sm ON ${metricJoinConditions(
                      'sm',
                  )}`
                : ''
        }${distinctDedupMetrics
            .map((col) => {
                const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                const cteName = `__dd_${snakeCaseName(fieldName)}`;
                return ` LEFT JOIN ${cteName} ON ${metricJoinConditions(
                    cteName,
                )}`;
            })
            .join('')})`;

        return [
            preGroupScopeCte,
            pivotSourceCte,
            scopedSourceCte,
            bucketedSourceCte,
            bucketedGroupsCte,
            ...(simpleMetricsCte ? [simpleMetricsCte] : []),
            ...distinctDedupCtes,
            groupByQueryCte,
        ];
    }

    private getGroupByQueryWithOtherSQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        maxGroups: number,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const groupByRefs = groupByColumns.map(
            (col) => `${q}${col.reference}${q}`,
        );
        const indexRefs = indexColumns.map((col) => `${q}${col.reference}${q}`);

        const caseWhens = groupByColumns.map(
            (col) =>
                `CASE WHEN gr.__group_rn <= ${maxGroups} THEN CAST(o.${q}${col.reference}${q} AS TEXT) ELSE '${OTHER_GROUP_SENTINEL_VALUE}' END`,
        );

        const caseWhenAliases = groupByColumns.map(
            (col, i) => `${caseWhens[i]} AS ${q}${col.reference}${q}`,
        );

        const indexSelects = indexColumns.map(
            (col) => `o.${q}${col.reference}${q}`,
        );

        const sortedBinRefs = this.getSortedBinDimensionReferences([
            ...groupByColumns,
            ...indexColumns,
        ]);
        const orderSelects = Array.from(sortedBinRefs).map(
            (ref) => `MIN(o.${q}${ref}_order${q}) AS ${q}${ref}_order${q}`,
        );

        const joinConditions = this.getNullSafeJoinConditions(
            'o',
            'gr',
            groupByColumns,
        );

        const metricSelects = valuesColumns.map((col) => {
            const agg =
                col.otherAggregation !== undefined &&
                col.otherAggregation !== null
                    ? col.otherAggregation
                    : col.aggregation;
            const aggregationField = getAggregatedField(
                this.warehouseSqlBuilder,
                agg,
                col.reference,
            );
            const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                col.reference,
                col.aggregation,
            );
            return `${aggregationField} AS ${q}${fieldName}${q}`;
        });

        const selectParts = [
            ...caseWhenAliases,
            ...indexSelects,
            ...orderSelects,
            ...metricSelects,
        ];

        const groupByParts = [...caseWhens, ...indexRefs];

        return `SELECT ${selectParts.join(', ')} FROM original_query o LEFT JOIN __group_ranking gr ON ${joinConditions.join(' AND ')} GROUP BY ${groupByParts.join(', ')}`;
    }

    private getGroupByQueryWithDropSQL(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        maxGroups: number,
    ): string {
        const joinConditions = this.getNullSafeJoinConditions(
            'pg',
            'gr',
            groupByColumns,
        );
        return `SELECT pg.* FROM pre_group_by pg INNER JOIN __group_ranking gr ON ${joinConditions.join(' AND ')} WHERE gr.__group_rn <= ${maxGroups}`;
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

        // Carry _order columns through for sorted custom bin dimensions
        const sortedBinRefs = this.getSortedBinDimensionReferences([
            ...(groupByColumns || []),
            ...indexColumns,
        ]);
        for (const ref of sortedBinRefs) {
            groupBySelectDimensions.push(`${q}${ref}_order${q}`);
        }

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
                    const nullsClause = PivotQueryBuilder.getNullsFirstLast(
                        sort.nullsFirst,
                    );
                    // Use column anchor value for value columns
                    const colAnchorCteName = `${sort.reference}_column_anchor`;

                    // todo: current SQL does not work with value sorting and multiple group columns
                    if (
                        groupByColumns.length === 1 &&
                        metricFirstValueQueries[colAnchorCteName]
                    ) {
                        acc.push(
                            `${q}${colAnchorCteName}${q}.${q}${colAnchorCteName}_value${q}${sortDirection}${nullsClause}`,
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
                    sort?.nullsFirst,
                );
                return this.prefixSortExprWithAlias(
                    sortExpr,
                    col.reference,
                    'g',
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
                    const nullsClause = PivotQueryBuilder.getNullsFirstLast(
                        sort.nullsFirst,
                    );
                    orderByParts.push(
                        `${q}${rowAnchorCteName}${q}.${q}${rowAnchorCteName}_value${q}${sortDirection}${nullsClause}`,
                    );
                }
            } else if (isIndexColumn) {
                // Only include index columns in row ordering
                const sortExpr = this.resolveSortField(
                    sort.reference,
                    sort.direction === SortByDirection.DESC,
                    sort.nullsFirst,
                );
                const prefixedExpr = this.prefixSortExprWithAlias(
                    sortExpr,
                    sort.reference,
                    'g',
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
                const prefixedExpr = this.prefixSortExprWithAlias(
                    sortExpr,
                    indexCol.reference,
                    'g',
                );
                orderByParts.push(prefixedExpr);
            }
        }

        return orderByParts.join(', ');
    }

    /**
     * Generates column anchor CTEs for value columns that have sorts.
     * Column anchors are used for column ordering (tie-breaking).
     *
     * @param valuesColumns - Value columns configuration
     * @param groupByColumns - Group by columns for partitioning
     * @param sortBy - Sort configuration to identify which value columns need anchor values
     * @returns Record mapping CTE names to their SQL definitions
     */
    private getColumnAnchorCTEs(
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): Record<string, { cteName: string; sql: string }> {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const result: Record<string, { cteName: string; sql: string }> = {};

        if (!valuesColumns || !sortBy) {
            return result;
        }

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
            const nullsClause = PivotQueryBuilder.getNullsFirstLast(
                sortConfig.nullsFirst,
            );

            const colAnchorCteName = `${valCol.reference}_column_anchor`;
            const groupColumnReferences = groupByColumns
                .map((col) => `${q}${col.reference}${q}`)
                .join(', ');

            const colAnchorSql = `SELECT DISTINCT ${groupColumnReferences}, FIRST_VALUE(${q}${fieldName}${q}) OVER (PARTITION BY ${groupColumnReferences} ORDER BY ${q}${fieldName}${q} ${sortDirection}${nullsClause} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS ${q}${colAnchorCteName}_value${q} FROM group_by_query`;

            result[colAnchorCteName] = {
                cteName: colAnchorCteName,
                sql: colAnchorSql,
            };
        });

        return result;
    }

    /**
     * Generates the column_ranking CTE that computes column_index for each distinct groupBy combination.
     * This is needed to identify the anchor column (column_index = 1) for row sorting.
     *
     * @param groupByColumns - Group by columns
     * @param valuesColumns - Value columns configuration
     * @param sortBy - Sort configuration
     * @param columnAnchorCTEs - Column anchor CTEs for metric-based column sorting
     * @returns SQL for the column_ranking CTE
     */
    private getColumnRankingSQL(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        sortBy: PivotConfiguration['sortBy'],
        columnAnchorCTEs: Record<string, { cteName: string; sql: string }>,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const groupByRefs = groupByColumns
            .map((col) => `g.${q}${col.reference}${q}`)
            .join(', ');

        // Build ORDER BY clause for column_index (same logic as buildGroupByOrderBy)
        const groupByOrderBy = this.buildGroupByOrderBy(
            groupByColumns,
            valuesColumns,
            sortBy,
            columnAnchorCTEs,
            q,
        );

        // Build JOINs for column anchor CTEs
        let fromClause = 'group_by_query g';
        const joins: string[] = [];

        Object.values(columnAnchorCTEs).forEach(({ cteName }) => {
            const joinConditions = groupByColumns
                .map(
                    (col) =>
                        `g.${q}${col.reference}${q} = ${q}${cteName}${q}.${q}${col.reference}${q}`,
                )
                .join(' AND ');
            joins.push(`LEFT JOIN ${q}${cteName}${q} ON ${joinConditions}`);
        });

        if (joins.length > 0) {
            fromClause += ` ${joins.join(' ')}`;
        }

        return `SELECT DISTINCT ${groupByRefs}, DENSE_RANK() OVER (ORDER BY ${groupByOrderBy}) AS ${q}col_idx${q} FROM ${fromClause}`;
    }

    /**
     * Generates the anchor_column CTE that identifies the groupBy value(s) with column_index = 1.
     * This is the "first pivot column" - when users sort by a metric, rows are ordered by
     * their metric value in this column (e.g., the latest month when columns are sorted DESC by date).
     * Uses ORDER BY + LIMIT 1 for deterministic selection of a single anchor value.
     *
     * @param groupByColumns - Group by columns
     * @param sortBy - Sort configuration to determine ORDER BY direction
     * @returns SQL for the anchor_column CTE
     */
    private getAnchorColumnSQL(
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Select each groupBy column with an alias for use in CROSS JOIN
        const selectParts = groupByColumns
            .map(
                (col) =>
                    `cr.${q}${col.reference}${q} AS ${q}anchor_${col.reference}${q}`,
            )
            .join(', ');

        // Build ORDER BY clause - use the same direction as the column sort
        const orderByParts = groupByColumns.map((col) => {
            const sort = sortBy?.find((s) => s.reference === col.reference);
            const direction =
                sort?.direction === SortByDirection.DESC ? 'DESC' : 'ASC';
            return `cr.${q}${col.reference}${q} ${direction}`;
        });

        // ORDER BY + LIMIT 1 ensures deterministic, scalar result
        return `SELECT ${selectParts} FROM column_ranking cr WHERE ${q}col_idx${q} = 1 ORDER BY ${orderByParts.join(
            ', ',
        )} LIMIT 1`;
    }

    /**
     * Generates row anchor CTEs for value columns that have sorts.
     * When sorting by a metric, rows are ordered by their metric value in the first pivot column
     * (anchor column), not by their MIN/MAX across all columns. This matches user expectations
     * when they click to sort by a metric - they expect ordering by the leftmost visible column.
     *
     * Uses CROSS JOIN with anchor_column CTE instead of scalar subqueries for cleaner SQL.
     *
     * @param indexColumns - Normalized index columns
     * @param valuesColumns - Value columns configuration
     * @param groupByColumns - Group by columns
     * @param sortBy - Sort configuration
     * @returns Record mapping CTE names to their SQL definitions
     */
    private getRowAnchorCTEs(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): Record<string, { cteName: string; sql: string }> {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const result: Record<string, { cteName: string; sql: string }> = {};

        if (!valuesColumns || !sortBy || indexColumns.length === 0) {
            return result;
        }

        const indexColumnRefs = indexColumns
            .map((col) => `q.${q}${col.reference}${q}`)
            .join(', ');

        const indexColumnGroupBy = indexColumns
            .map((col) => `q.${q}${col.reference}${q}`)
            .join(', ');

        // Build condition to match anchor column using CROSS JOIN alias
        const anchorMatchConditions = groupByColumns
            .map(
                (col) =>
                    `q.${q}${col.reference}${q} = ac.${q}anchor_${col.reference}${q}`,
            )
            .join(' AND ');

        valuesColumns.forEach((valCol) => {
            const sortConfig = sortBy.find(
                (sort) => sort.reference === valCol.reference,
            );
            if (!sortConfig) return;

            const fieldName = PivotQueryBuilder.getValueColumnFieldName(
                valCol.reference,
                valCol.aggregation,
            );

            const rowAnchorCteName = `${valCol.reference}_row_anchor`;

            // Use CROSS JOIN with anchor_column and conditional aggregation
            // MAX is used because there should be at most one value per (indexCols, anchorCol)
            const rowAnchorSql = `SELECT ${indexColumnRefs}, MAX(CASE WHEN ${anchorMatchConditions} THEN q.${q}${fieldName}${q} END) AS ${q}${rowAnchorCteName}_value${q} FROM group_by_query q CROSS JOIN anchor_column ac GROUP BY ${indexColumnGroupBy}`;

            result[rowAnchorCteName] = {
                cteName: rowAnchorCteName,
                sql: rowAnchorSql,
            };
        });

        return result;
    }

    /**
     * Generates all metric anchor CTEs for pivot sorting.
     * Returns column anchors, column ranking, anchor column, and row anchors in the correct order.
     *
     * @param indexColumns - Normalized index columns
     * @param valuesColumns - Value columns configuration
     * @param groupByColumns - Group by columns
     * @param sortBy - Sort configuration
     * @returns Object containing all anchor-related CTEs and the combined metricFirstValueQueries map
     */
    private getMetricAnchorCTEs(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
    ): {
        columnAnchorCTEs: string[];
        columnRankingCTE: string | null;
        anchorColumnCTE: string | null;
        rowAnchorCTEs: string[];
        metricFirstValueQueries: Record<
            string,
            { cteName: string; sql: string }
        >;
    } {
        // Get column anchor CTEs (for column ordering)
        const columnAnchorQueries = this.getColumnAnchorCTEs(
            valuesColumns,
            groupByColumns,
            sortBy,
        );

        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const columnAnchorCTEs = Object.values(columnAnchorQueries).map(
            ({ cteName, sql }) => `${q}${cteName}${q} AS (${sql})`,
        );

        // Check if we need row anchor CTEs (only when sorting by a metric value AND have index columns)
        // When sorting by a metric, we need additional CTEs to identify the "first pivot column"
        // and compute row anchor values from that specific column only.
        // When there are no index columns, row sorting is not needed (all rows have row_index = 1)
        const hasMetricSort = valuesColumns?.some((valCol) =>
            sortBy?.some((sort) => sort.reference === valCol.reference),
        );
        const needsRowAnchor = hasMetricSort && indexColumns.length > 0;

        let columnRankingCTE: string | null = null;
        let anchorColumnCTE: string | null = null;
        let rowAnchorCTEs: string[] = [];
        let rowAnchorQueries: Record<string, { cteName: string; sql: string }> =
            {};

        if (needsRowAnchor) {
            // Generate column_ranking CTE
            const columnRankingSQL = this.getColumnRankingSQL(
                groupByColumns,
                valuesColumns,
                sortBy,
                columnAnchorQueries,
            );
            columnRankingCTE = `column_ranking AS (${columnRankingSQL})`;

            // Generate anchor_column CTE
            const anchorColumnSQL = this.getAnchorColumnSQL(
                groupByColumns,
                sortBy,
            );
            anchorColumnCTE = `anchor_column AS (${anchorColumnSQL})`;

            // Generate row anchor CTEs using anchor_column
            rowAnchorQueries = this.getRowAnchorCTEs(
                indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
            );
            rowAnchorCTEs = Object.values(rowAnchorQueries).map(
                ({ cteName, sql }) => `${q}${cteName}${q} AS (${sql})`,
            );
        }

        // Combine all queries for the metricFirstValueQueries map (used by getPivotQuerySQL)
        const metricFirstValueQueries = {
            ...columnAnchorQueries,
            ...rowAnchorQueries,
        };

        return {
            columnAnchorCTEs,
            columnRankingCTE,
            anchorColumnCTE,
            rowAnchorCTEs,
            metricFirstValueQueries,
        };
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

    /**
     * Generates the row_ranking CTE that computes row_index for each distinct
     * index column combination. Isolates Window function + anchor value references
     * in a self-contained CTE so Databricks/Spark can resolve them when inlining.
     *
     * @param indexColumns - Index columns for row identification
     * @param valuesColumns - Value columns configuration
     * @param sortBy - Sort configuration
     * @param rowAnchorQueries - Row anchor CTEs to join with
     * @returns SQL for the row_ranking CTE
     */
    private getRowRankingSQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        sortBy: PivotConfiguration['sortBy'],
        rowAnchorQueries: Record<string, { cteName: string; sql: string }>,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        const indexRefs = indexColumns
            .map((col) => `g.${q}${col.reference}${q}`)
            .join(', ');

        // Reuse buildRowIndexOrderBy to get the same ORDER BY logic
        const rowIndexOrderBy = this.buildRowIndexOrderBy(
            indexColumns,
            valuesColumns,
            sortBy,
            rowAnchorQueries,
            q,
        );

        // Build FROM clause with JOINs for row anchor CTEs
        let fromClause = 'group_by_query g';
        const joins: string[] = [];

        Object.values(rowAnchorQueries).forEach(({ cteName }) => {
            const joinConditions = indexColumns
                .map(
                    (col) =>
                        `g.${q}${col.reference}${q} = ${q}${cteName}${q}.${q}${col.reference}${q}`,
                )
                .join(' AND ');
            joins.push(`LEFT JOIN ${q}${cteName}${q} ON ${joinConditions}`);
        });

        if (joins.length > 0) {
            fromClause += ` ${joins.join(' ')}`;
        }

        return `SELECT DISTINCT ${indexRefs}, DENSE_RANK() OVER (ORDER BY ${rowIndexOrderBy}) AS ${q}row_index${q} FROM ${fromClause}`;
    }

    private getPivotQuerySQL(
        indexColumns: ReturnType<typeof normalizeIndexColumns>,
        valuesColumns: PivotConfiguration['valuesColumns'],
        groupByColumns: NonNullable<PivotConfiguration['groupByColumns']>,
        sortBy: PivotConfiguration['sortBy'],
        metricFirstValueQueries: Record<
            string,
            { cteName: string; sql: string }
        >,
        usePrecomputedRankings: boolean = false,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

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

        if (usePrecomputedRankings) {
            // Join with precomputed row_ranking and column_ranking CTEs.
            // This avoids Window functions in pivot_query — anchor column references
            // stay isolated in the ranking CTEs where Databricks/Spark can resolve
            // them within each CTE's self-contained scope.
            let fromClause = 'group_by_query g';
            const joins: string[] = [];

            if (indexColumns.length > 0) {
                const rowRankJoinConditions = indexColumns
                    .map(
                        (col) =>
                            `g.${q}${col.reference}${q} = rr.${q}${col.reference}${q}`,
                    )
                    .join(' AND ');
                joins.push(
                    `LEFT JOIN row_ranking rr ON ${rowRankJoinConditions}`,
                );
            }

            const colRankJoinConditions = groupByColumns
                .map(
                    (col) =>
                        `g.${q}${col.reference}${q} = cr.${q}${col.reference}${q}`,
                )
                .join(' AND ');
            joins.push(
                `LEFT JOIN column_ranking cr ON ${colRankJoinConditions}`,
            );

            if (joins.length > 0) {
                fromClause += ` ${joins.join(' ')}`;
            }

            const rowIndexExpression =
                indexColumns.length > 0 ? `rr.${q}row_index${q}` : '1';

            return `SELECT ${selectReferences.join(', ')}, ${rowIndexExpression} AS ${q}row_index${q}, cr.${q}col_idx${q} AS ${q}column_index${q} FROM ${fromClause}`;
        }

        // Original path: compute rankings inline with Window functions
        let fromClause = 'group_by_query g';
        const joins: string[] = [];

        // Add joins for metric first value CTEs
        // Use LEFT JOIN to preserve all rows even when anchor values are NULL
        Object.values(metricFirstValueQueries).forEach(({ cteName }) => {
            if (cteName.endsWith('_row_anchor')) {
                // Join on index columns for row anchor CTEs
                // Skip if no index columns (row anchor CTEs shouldn't exist in this case)
                if (indexColumns.length > 0) {
                    const joinConditions = indexColumns
                        .map(
                            (col) =>
                                `g.${q}${col.reference}${q} = ${q}${cteName}${q}.${q}${col.reference}${q}`,
                        )
                        .join(' AND ');
                    joins.push(
                        `LEFT JOIN ${q}${cteName}${q} ON ${joinConditions}`,
                    );
                }
            } else if (cteName.endsWith('_column_anchor')) {
                // Join on group columns for column anchor CTEs
                const joinConditions = groupByColumns
                    .map(
                        (col) =>
                            `g.${q}${col.reference}${q} = ${q}${cteName}${q}.${q}${col.reference}${q}`,
                    )
                    .join(' AND ');
                joins.push(`LEFT JOIN ${q}${cteName}${q} ON ${joinConditions}`);
            }
        });

        if (joins.length > 0) {
            fromClause += ` ${joins.join(' ')}`;
        }

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

        // If there are no index columns, use a constant for row_index (all rows have same index)
        const rowIndexExpression = rowIndexOrderBy
            ? `DENSE_RANK() OVER (ORDER BY ${rowIndexOrderBy})`
            : `1`;

        return `SELECT ${selectReferences.join(
            ', ',
        )}, ${rowIndexExpression} AS ${q}row_index${q}, DENSE_RANK() OVER (ORDER BY ${groupByOrderBy}) AS ${q}column_index${q} FROM ${fromClause}`;
    }

    /**
     * Compiles pivot table calculations into SQL.
     * @returns SQL for table calculations CTE or undefined if no pivot calculations
     */
    private getPivotTableCalculationsSQL(): string | undefined {
        const pivotTableCalcs = Object.values(this.pivotTableCalculations);
        if (pivotTableCalcs.length === 0) {
            return undefined;
        }

        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        const compiler = new TableCalculationFunctionCompiler(
            this.warehouseSqlBuilder,
        );

        const pivotCalculations: string[] = [];

        for (const tc of pivotTableCalcs) {
            if (isSqlTableCalculation(tc)) {
                // Parse functions from the table calculation SQL
                const functions = parseTableCalculationFunctions(tc.sql);

                // Use the compiler to replace all functions
                let processedSql = compiler.compileFunctions(tc.sql, functions);

                // Replace field references with their aliased names from pivot_query
                processedSql =
                    this.replaceFieldReferencesWithAliases(processedSql);

                pivotCalculations.push(
                    `${processedSql} AS ${q}${tc.name}_any${q}`, // todo: can we handle dynamic aggregation? hardcode prefix for now.
                );
            }
        }

        if (pivotCalculations.length === 0) {
            return undefined;
        }

        // Select all columns from pivot_query and add the table calculations
        return `SELECT *, ${pivotCalculations.join(', ')} FROM pivot_query`;
    }

    /**
     * Replaces field references in table calculation SQL with their aliased names from pivot_query.
     * For example, 'revenue' becomes 'revenue_sum' if the aggregation is SUM.
     * @param sql - The table calculation SQL containing field references
     * @returns SQL with field references replaced by their pivot_query aliases
     */
    private replaceFieldReferencesWithAliases(sql: string): string {
        // Build a map of original field names to their aliased names
        const fieldAliasMap: Record<string, string> = {};

        // Add value columns with their aggregation suffix
        if (this.pivotConfiguration.valuesColumns) {
            for (const col of this.pivotConfiguration.valuesColumns) {
                const aliasedName = PivotQueryBuilder.getValueColumnFieldName(
                    col.reference,
                    col.aggregation,
                );
                fieldAliasMap[col.reference] = aliasedName;
            }
        }

        // Add index columns (they keep their original names)
        if (this.pivotConfiguration.indexColumn) {
            const indexColumns = normalizeIndexColumns(
                this.pivotConfiguration.indexColumn,
            );
            for (const col of indexColumns) {
                fieldAliasMap[col.reference] = col.reference;
            }
        }

        // Add group by columns (they keep their original names)
        if (this.pivotConfiguration.groupByColumns) {
            for (const col of this.pivotConfiguration.groupByColumns) {
                fieldAliasMap[col.reference] = col.reference;
            }
        }

        return sql.replace(lightdashVariablePattern, (fullmatch, ref) => {
            const { refTable, refName } = getParsedReference(
                ref,
                '', // todo: explore base table
            );
            const fieldId = getItemId({ table: refTable, name: refName });
            // First field match, second table calculation match, fallback
            return fieldAliasMap[fieldId] || fieldAliasMap[ref] || fullmatch;
        });
    }

    /**
     * Generates complete pivot SQL with all CTEs for grouped pivot.
     * @param userSql - Original user SQL query
     * @param groupByQuery - GROUP BY query SQL
     * @param indexColumns - Index columns for row identification
     * @param valuesColumns - Value columns to aggregate
     * @param groupByColumns - Columns to pivot across
     * @param sortBy - Sort configuration
     * @param columnLimit - Maximum number of columns to return
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

        // Exclude Pivot table calculations from valuesColumns - they are handled separately
        const valuesColumnsWithoutPivotTableCalculations = valuesColumns.filter(
            (col) => !this.pivotTableCalculations[col.reference],
        );

        // Get all metric anchor CTEs in the correct order
        const {
            columnAnchorCTEs,
            columnRankingCTE,
            anchorColumnCTE,
            rowAnchorCTEs,
            metricFirstValueQueries,
        } = this.getMetricAnchorCTEs(
            indexColumns,
            valuesColumnsWithoutPivotTableCalculations,
            groupByColumns,
            sortBy,
        );

        // When metric sorting with index columns is active (needsRowAnchor),
        // compute rankings in separate CTEs instead of inline Window functions.
        // This prevents Databricks/Spark from failing when it inlines CTEs and
        // can't resolve anchor column references in Window ORDER BY clauses.
        const needsPrecomputedRankings =
            columnRankingCTE !== null && indexColumns.length > 0;

        let rowRankingCTE: string | null = null;
        if (needsPrecomputedRankings) {
            // Extract only row anchor queries for the row_ranking CTE
            const rowAnchorQueries = Object.fromEntries(
                Object.entries(metricFirstValueQueries).filter(([key]) =>
                    key.endsWith('_row_anchor'),
                ),
            );
            const rowRankingSQL = this.getRowRankingSQL(
                indexColumns,
                valuesColumnsWithoutPivotTableCalculations,
                sortBy,
                rowAnchorQueries,
            );
            rowRankingCTE = `row_ranking AS (${rowRankingSQL})`;
        }

        const pivotQuery = this.getPivotQuerySQL(
            indexColumns,
            valuesColumnsWithoutPivotTableCalculations,
            groupByColumns,
            sortBy,
            metricFirstValueQueries,
            needsPrecomputedRankings,
        );

        let maxColumnsPerValueColumnSql = '';

        if (columnLimit) {
            const maxColumnsPerValueColumn =
                PivotQueryBuilder.calculateMaxColumnsPerValueColumn(
                    valuesColumns,
                    columnLimit,
                    this.pivotConfiguration.metricsAsRows,
                );

            // Keep leading space to avoid SQL syntax errors
            maxColumnsPerValueColumnSql = ` and p.${q}column_index${q} <= ${maxColumnsPerValueColumn}`;
        }

        const totalColumnsQuery = this.getTotalColumnsSQL(
            groupByColumns,
            valuesColumns,
            'filtered_rows',
        );

        const { groupLimit } = this.pivotConfiguration;
        const groupingMode = PivotQueryBuilder.getGroupingMode(
            groupLimit,
            groupByColumns,
            valuesColumns,
            this.pivotSource,
            this.rawOtherEnabled,
        );
        const totalGroupsSourceTable =
            groupingMode === 'none' ? 'group_by_query' : 'pre_group_by';
        const totalGroupsQuery = this.getTotalGroupsSQL(
            groupByColumns,
            totalGroupsSourceTable,
        );

        // Build CTEs in correct dependency order:
        // 0. (optional) pre_group_by, __group_totals, __group_ranking (for "Other"/"drop" modes)
        // 1. original_query, group_by_query (base data)
        // 2. column anchor CTEs (for column ordering)
        // 3. column_ranking, anchor_column (for metric-based row sorting - identifies first pivot column)
        // 4. row anchor CTEs (uses anchor_column to get metric value at first column only)
        // 5. row_ranking (when precomputed rankings are used)
        // 6. pivot_query, filtered_rows, total_columns
        // 7. pivot_table_calculations (if there are any pivot table calculations)
        const ctes: string[] = [`original_query AS (${userSql})`];

        if (groupingMode === 'raw_other' && groupLimit) {
            const maxGroups = Math.max(1, Math.floor(groupLimit.maxGroups));
            ctes.push(`pre_group_by AS (${groupByQuery})`);
            ctes.push(
                ...this.getGroupRankingCTEs(
                    groupByColumns,
                    valuesColumns,
                    indexColumns,
                    maxGroups,
                ),
            );
            ctes.push(
                ...this.getRawOtherCtes(
                    indexColumns,
                    valuesColumns,
                    groupByColumns,
                    maxGroups,
                ),
            );
        } else if (groupingMode === 'fast_other' && groupLimit) {
            const maxGroups = Math.max(1, Math.floor(groupLimit.maxGroups));
            ctes.push(`pre_group_by AS (${groupByQuery})`);
            ctes.push(
                ...this.getGroupRankingCTEs(
                    groupByColumns,
                    valuesColumns,
                    indexColumns,
                    maxGroups,
                ),
            );
            const otherGroupByQuery = this.getGroupByQueryWithOtherSQL(
                indexColumns,
                valuesColumns,
                groupByColumns,
                maxGroups,
            );
            ctes.push(`group_by_query AS (${otherGroupByQuery})`);
        } else if (groupingMode === 'drop' && groupLimit) {
            const maxGroups = Math.max(1, Math.floor(groupLimit.maxGroups));
            ctes.push(`pre_group_by AS (${groupByQuery})`);
            ctes.push(
                ...this.getGroupRankingCTEs(
                    groupByColumns,
                    valuesColumns,
                    indexColumns,
                    maxGroups,
                ),
            );
            const dropGroupByQuery = this.getGroupByQueryWithDropSQL(
                groupByColumns,
                maxGroups,
            );
            ctes.push(`group_by_query AS (${dropGroupByQuery})`);
        } else {
            ctes.push(`group_by_query AS (${groupByQuery})`);
        }

        ctes.push(
            ...columnAnchorCTEs,
            ...(columnRankingCTE ? [columnRankingCTE] : []),
            ...(anchorColumnCTE ? [anchorColumnCTE] : []),
            ...rowAnchorCTEs,
            ...(rowRankingCTE ? [rowRankingCTE] : []),
            `pivot_query AS (${pivotQuery})`,
        );

        // Reference the appropriate table for filtered_rows and final select
        let pivotTableRef = 'pivot_query';

        // Add pivot table calculations CTE if there are any
        const pivotTableCalcsSql = this.getPivotTableCalculationsSQL();
        if (pivotTableCalcsSql) {
            ctes.push(`pivot_table_calculations AS (${pivotTableCalcsSql})`);
            pivotTableRef = 'pivot_table_calculations';
        }

        ctes.push(
            `filtered_rows AS (SELECT * FROM ${pivotTableRef} WHERE ${q}row_index${q} <= ${rowLimit})`,
            `total_columns AS (${totalColumnsQuery})`,
            `total_groups AS (${totalGroupsQuery})`,
        );

        const finalSelect = `SELECT p.*, t.total_columns, g.total_groups FROM ${pivotTableRef} p CROSS JOIN total_columns t CROSS JOIN total_groups g WHERE p.${q}row_index${q} <= ${rowLimit}${maxColumnsPerValueColumnSql} order by p.${q}row_index${q}, p.${q}column_index${q}`;

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
     * @param opts - Optional configuration object
     * @param opts.columnLimit - Maximum number of columns to generate for the pivot query
     * @returns Complete SQL query with CTEs for pivoting the data
     * @throws {ParameterError} If no index columns are provided
     */
    toSql(opts?: { columnLimit: number }): string {
        const indexColumns = normalizeIndexColumns(
            this.pivotConfiguration.indexColumn,
        );

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

        let finalSql: string;

        if (groupByColumns && groupByColumns.length > 0) {
            const { columnLimit } = opts ?? {};
            finalSql = this.getFullPivotSQL(
                baseSql,
                groupByQuery,
                indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
                columnLimit,
            );
        } else {
            finalSql = this.getSimpleQuerySQL(baseSql, groupByQuery, sortBy);
        }

        return finalSql;
    }
}
