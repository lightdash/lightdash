import {
    buildTotalFieldRegex,
    CompiledDimension,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTable,
    CompiledTableCalculation,
    CompileError,
    createFilterRuleFromModelRequiredFilterRule,
    DimensionType,
    Explore,
    ExploreCompiler,
    extractableTimeFrames,
    extractTotalReferences,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterGroupItem,
    FilterOperator,
    FilterRule,
    getCustomMetricDimensionId,
    getDimensionMapFromTables,
    getDimensions,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getItemId,
    getMetricsMapFromTables,
    getParsedReference,
    getPopComparisonConfigKey,
    getSqlForTruncatedDate,
    hashPopComparisonConfigKeyToSuffix,
    hasPivotFunctions,
    hasRowFunctions,
    IntrinsicUserAttributes,
    isAggregateMetricType,
    isAndFilterGroup,
    isCompiledCustomSqlDimension,
    isCustomBinDimension,
    isDimension,
    isFilterGroup,
    isFilterRuleInQuery,
    isJoinModelRequiredFilter,
    isNonAggregateMetric,
    isPeriodOverPeriodAdditionalMetric,
    isPostCalculationMetric,
    ItemsMap,
    lightdashVariablePattern,
    MetricFilterRule,
    MetricType,
    parseAllReferences,
    parseTableCalculationFunctions,
    PivotConfiguration,
    QueryWarning,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    snakeCaseName,
    SortField,
    sqlAggregationWrapsReferences,
    sqlContainsAggregation,
    SupportedDbtAdapter,
    TableCalculationFunctionCompiler,
    timeFrameConfigs,
    TimeFrames,
    truncatableTimeFrames,
    UserAttributeValueMap,
    type FieldsContext,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
    type WeekDay,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { compilePostCalculationMetric } from '../../queryCompiler';
import {
    safeReplaceParametersWithTypes,
    unsafeReplaceParametersAsRaw,
} from './parameters';
import {
    assertValidDimensionRequiredAttribute,
    findMetricInflationWarnings,
    findTablesWithMetricInflation,
    getCustomBinDimensionSql,
    getCustomSqlDimensionSql,
    getDimensionFromFilterTargetId,
    getDimensionFromId,
    getJoinedTables,
    getJoinType,
    isInflationProofMetric,
    replaceUserAttributesAsStrings,
    replaceUserAttributesRaw,
    sortDayOfWeekName,
    sortMonthName,
} from './utils';

export type CompiledQuery = {
    query: string;
    fields: ItemsMap;
    warnings: QueryWarning[];
    parameterReferences: Set<string>;
    missingParameterReferences: Set<string>;
    usedParameters: ParametersValuesMap;
    compilationErrors: string[];
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    userAttributes?: UserAttributeValueMap;
    parameters?: ParametersValuesMap;
    parameterDefinitions: ParameterDefinitions;
    intrinsicUserAttributes: IntrinsicUserAttributes;
    pivotConfiguration?: PivotConfiguration;
    /**
     * List of dimension field IDs used as pivot columns (e.g., from chart's pivotConfig.columns).
     * Used by row_total() to determine non-pivot dimensions for GROUP BY.
     * This is a lightweight alternative to pivotConfiguration — when pivotConfiguration is
     * not available (e.g., feature flag off), pivotDimensions still lets row_total() work correctly.
     */
    pivotDimensions?: string[];
    timezone: string;
    /**
     * When true, compilation errors (e.g., invalid filter values) are collected
     * instead of thrown, and the query is returned with placeholder SQL for
     * invalid filters. Useful for debugging/viewing SQL even with errors.
     */
    continueOnError?: boolean;
    /**
     * The original explore before date zoom modifications.
     * When date zoom changes granularity, the explore's dimension compiledSql
     * is modified with DATE_TRUNC. Filters should compare against the raw
     * column, not the truncated expression. When set, filter compilation uses
     * this explore for dimension field lookups instead of the zoomed explore.
     */
    originalExplore?: Explore;
    /** Wrap DATE_TRUNC with timezone conversion. Gated behind EnableTimezoneSupport. */
    useTimezoneAwareDateTrunc?: boolean;
    /** Timezone the column data is in — source for the timezone-aware wrap.
     *  Derived from warehouse credentials via `getColumnTimezone`. */
    columnTimezone?: string;
};

/**
 * Creates the correct interval syntax for date arithmetic operations with comparison across different warehouse types.
 * For BigQuery, always uses DATE_ADD/DATE_SUB functions.
 *
 * @param adapterType - The warehouse adapter type
 * @param column - The column name to apply the interval to
 * @param columnWithInterval - The column to apply the interval to
 * @param operator - The comparison operator ('=', '>=', '<=')
 * @param value - The interval value (e.g., 1, 2, 7)
 * @param granularity - The time granularity (e.g., 'day', 'week', 'month', 'year')
 * @param isAdd - Whether to add (true) or subtract (false) the interval
 * @returns The warehouse-specific interval syntax with comparison
 */
/**
 * Normalizes intervals to units supported by databases.
 * - QUARTER → 3 MONTH (QUARTER not universally supported)
 * - WEEK → 7 DAY (only when convertWeeks is true, for Athena which doesn't support WEEK intervals)
 * @param value - The interval value
 * @param granularity - The time granularity
 * @param convertWeeks - Whether to convert WEEK to DAY (only needed for Athena)
 * @returns Tuple of [convertedValue, convertedGranularity]
 */
function normalizeIntervalGranularity(
    value: number,
    granularity: string,
    convertWeeks: boolean = false,
): [number, string] {
    const upperGranularity = granularity.toUpperCase();

    if (upperGranularity === 'QUARTER') {
        return [value * 3, 'MONTH'];
    }

    if (convertWeeks && upperGranularity === 'WEEK') {
        return [value * 7, 'DAY'];
    }

    return [value, granularity];
}

export function getIntervalSyntax(
    adapterType: SupportedDbtAdapter,
    column: string,
    columnWithInterval: string,
    operator: '=' | '>=' | '<=',
    value: number,
    granularity: string,
    isAdd: boolean = true,
): string {
    const operation = isAdd ? 'ADD' : 'SUB';

    let intervalExpression: string;

    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            // BigQuery always uses DATE_ADD/DATE_SUB
            intervalExpression = `DATE_${operation}(DATE(${columnWithInterval}), INTERVAL ${value} ${granularity})`;
            break;
        case SupportedDbtAdapter.DATABRICKS: {
            // Databricks uses interval arithmetic with quoted values
            // Databricks doesn't support QUARTER interval, convert to months
            const [dbValue, dbGranularity] = normalizeIntervalGranularity(
                value,
                granularity,
            );
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${dbValue}' ${dbGranularity}`;
            break;
        }
        case SupportedDbtAdapter.SNOWFLAKE:
            // Snowflake uses DATEADD function
            intervalExpression = `DATEADD(${granularity}, ${
                isAdd ? value : -value
            }, ${columnWithInterval})`;
            break;
        case SupportedDbtAdapter.REDSHIFT: {
            // Redshift uses DATEADD and doesn't support QUARTER directly
            const [redshiftValue, redshiftGranularity] =
                normalizeIntervalGranularity(value, granularity);
            intervalExpression = `DATEADD(${redshiftGranularity}, ${
                isAdd ? redshiftValue : -redshiftValue
            }, ${columnWithInterval})`;
            break;
        }
        case SupportedDbtAdapter.POSTGRES: {
            // Postgres uses standard interval arithmetic
            // Postgres doesn't support QUARTER interval, convert to months
            const [pgValue, pgGranularity] = normalizeIntervalGranularity(
                value,
                granularity,
            );
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${pgValue} ${pgGranularity}'`;
            break;
        }
        case SupportedDbtAdapter.TRINO: {
            // Trino uses standard interval arithmetic
            const [trinoValue, trinoGranularity] = normalizeIntervalGranularity(
                value,
                granularity,
            );
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${trinoValue}' ${trinoGranularity}`;
            break;
        }
        case SupportedDbtAdapter.ATHENA: {
            // Athena uses standard interval arithmetic
            // Athena doesn't support WEEK interval, convert to days
            const [athenaValue, athenaGranularity] =
                normalizeIntervalGranularity(value, granularity, true);
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${athenaValue}' ${athenaGranularity}`;
            break;
        }
        case SupportedDbtAdapter.CLICKHOUSE: {
            // ClickHouse uses date arithmetic functions
            // ClickHouse doesn't support QUARTER interval, convert to months
            const [chValue, chGranularity] = normalizeIntervalGranularity(
                value,
                granularity,
            );
            const func = isAdd ? 'date_add' : 'date_sub';
            intervalExpression = `${func}(${columnWithInterval}, INTERVAL ${chValue} ${chGranularity})`;
            break;
        }
        default:
            // Default to standard SQL interval syntax
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL ${value} ${granularity}`;
            break;
    }

    return `${
        adapterType === SupportedDbtAdapter.BIGQUERY
            ? `DATE(${column})`
            : column
    } ${operator} ${intervalExpression}`;
}

export class MetricQueryBuilder {
    private compilationErrors: string[] = [];

    private readonly baseMetricIdByPopMetricId: Record<string, string> = {};

    private popComparisonConfigs: Array<{
        timeDimensionId: string;
        granularity: TimeFrames;
        periodOffset: number;
        configKey: string;
        cteSuffix: string;
    }> = [];

    private readonly popMetricEntriesByConfigKey: Record<
        string,
        Array<{ popMetricId: string; baseMetricId: string }>
    > = {};

    private isPopMetricId(metricId: string): boolean {
        return metricId in this.baseMetricIdByPopMetricId;
    }

    private readonly exploreDimensions: Record<string, CompiledDimension> = {};

    private readonly exploreDimensionsWithoutAccess: Record<
        string,
        CompiledDimension
    > = {};

    /** Query timezone when timezone-aware DATE_TRUNC is active, undefined otherwise. */
    private get timezoneForDateTrunc(): string | undefined {
        if (!this.args.useTimezoneAwareDateTrunc) return undefined;
        if (this.columnTimezone === this.args.timezone) return undefined;
        return this.args.timezone;
    }

    private get columnTimezone(): string {
        return this.args.columnTimezone ?? 'UTC';
    }

    // Contains the metrics from the Explore and the custom metrics from the metric query
    private readonly availableMetrics: Record<string, CompiledMetric> = {};

    constructor(private args: BuildQueryProps) {
        const { explore, compiledMetricQuery } = this.args;
        this.exploreDimensions = getDimensionMapFromTables(explore.tables);
        this.exploreDimensionsWithoutAccess = getDimensionMapFromTables(
            explore.unfilteredTables ?? {},
        );
        this.availableMetrics = {
            ...getMetricsMapFromTables(explore.tables),
            ...compiledMetricQuery.compiledAdditionalMetrics.reduce<
                Record<string, CompiledMetric>
            >(
                (acc, metric) => ({
                    ...acc,
                    [getItemId(metric)]: metric,
                }),
                {},
            ),
        };

        const selectedPopAdditionalMetrics = (
            compiledMetricQuery.additionalMetrics ?? []
        )
            .filter(isPeriodOverPeriodAdditionalMetric)
            .filter((am) =>
                compiledMetricQuery.metrics.includes(getItemId(am)),
            );

        if (selectedPopAdditionalMetrics.length > 0) {
            const configsByKey = new Map<
                string,
                {
                    timeDimensionId: string;
                    granularity: TimeFrames;
                    periodOffset: number;
                    cteSuffix: string;
                }
            >();

            selectedPopAdditionalMetrics.forEach((am) => {
                const configKey = getPopComparisonConfigKey({
                    timeDimensionId: am.timeDimensionId,
                    granularity: am.granularity,
                    periodOffset: am.periodOffset,
                });
                const cteSuffixHash =
                    hashPopComparisonConfigKeyToSuffix(configKey);
                const granularityLabel = String(am.granularity).toLowerCase();
                // Keep CTE suffix short to avoid identifier truncation (e.g. Postgres 63-char limit).
                // Uniqueness comes from hashing the full config key.
                const cteSuffix = `${granularityLabel}_${am.periodOffset}__${cteSuffixHash}`;
                configsByKey.set(configKey, {
                    timeDimensionId: am.timeDimensionId,
                    granularity: am.granularity,
                    periodOffset: am.periodOffset,
                    cteSuffix,
                });

                const popMetricId = getItemId(am);
                this.baseMetricIdByPopMetricId[popMetricId] = am.baseMetricId;

                if (!this.popMetricEntriesByConfigKey[configKey]) {
                    this.popMetricEntriesByConfigKey[configKey] = [];
                }
                this.popMetricEntriesByConfigKey[configKey].push({
                    popMetricId,
                    baseMetricId: am.baseMetricId,
                });
            });

            this.popComparisonConfigs = Array.from(configsByKey.entries()).map(
                ([configKey, config]) => ({
                    ...config,
                    configKey,
                }),
            );

            // Ensure each comparison time dimension is selected in the query (required for joins)
            this.popComparisonConfigs.forEach((cfg) => {
                if (
                    !compiledMetricQuery.dimensions.includes(
                        cfg.timeDimensionId,
                    )
                ) {
                    throw new CompileError(
                        `Period comparison time dimension "${cfg.timeDimensionId}" must be selected in the query`,
                        {},
                    );
                }
            });
        }
    }

    static buildCtesSQL(ctes: string[]) {
        return ctes.length > 0 ? `WITH ${ctes.join(',\n')}` : undefined;
    }

    static assembleSqlParts(parts: Array<string | undefined>) {
        return parts.filter((l) => l !== undefined).join('\n');
    }

    private static combineWhereClauses(
        ...clauses: Array<string | undefined>
    ): string | undefined {
        const conditions = clauses
            .filter((clause): clause is string => clause !== undefined)
            .map((clause) => clause.replace(/^WHERE\s+/i, '').trim())
            .filter((clause) => clause.length > 0);

        return conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : undefined;
    }

    private getMetricFromId(metricId: string): CompiledMetric {
        const metric = this.availableMetrics[metricId];
        if (!metric) {
            throw new FieldReferenceError(
                `Tried to reference metric with unknown field id: ${metricId}`,
            );
        }
        return metric;
    }

    private isFilterOnPopComparisonTimeDimension(
        filter: FilterRule,
        timeDimensionId: string,
    ): boolean {
        if (filter.target.fieldId === timeDimensionId) {
            return true;
        }

        const { compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const adapterType: SupportedDbtAdapter =
            warehouseSqlBuilder.getAdapterType();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();

        const popDimension = getDimensionFromId({
            dimId: timeDimensionId,
            dimensions: this.exploreDimensions,
            dimensionsWithoutAccess: this.exploreDimensionsWithoutAccess,
            adapterType,
            startOfWeek,
            timezone: this.timezoneForDateTrunc,
            columnTimezone: this.columnTimezone,
        });
        const popDimensionBaseId = `${popDimension.table}_${
            popDimension.timeIntervalBaseDimensionName ?? popDimension.name
        }`;

        try {
            const filterDimension = getDimensionFromFilterTargetId({
                filterTargetId: filter.target.fieldId,
                dimensions: this.exploreDimensions,
                dimensionsWithoutAccess: this.exploreDimensionsWithoutAccess,
                compiledCustomDimensions:
                    compiledMetricQuery.compiledCustomDimensions.filter(
                        isCompiledCustomSqlDimension,
                    ),
                adapterType,
                startOfWeek,
            });

            if (isCompiledCustomSqlDimension(filterDimension)) {
                return false;
            }

            return (
                `${filterDimension.table}_${
                    filterDimension.timeIntervalBaseDimensionName ??
                    filterDimension.name
                }` === popDimensionBaseId
            );
        } catch (error) {
            if (
                this.args.continueOnError &&
                error instanceof FieldReferenceError
            ) {
                this.compilationErrors.push(error.message);
                return false;
            }
            throw error;
        }
    }

    private getDimensionsFilterGroupWithoutPopTimeFilters(
        timeDimensionId: string,
        filterGroup: FilterGroup | undefined,
    ): FilterGroup | undefined {
        if (!filterGroup) {
            return undefined;
        }

        const items = isAndFilterGroup(filterGroup)
            ? filterGroup.and
            : filterGroup.or;

        const filteredItems = items.reduce<FilterGroupItem[]>((acc, item) => {
            if (isFilterGroup(item)) {
                const nestedGroup =
                    this.getDimensionsFilterGroupWithoutPopTimeFilters(
                        timeDimensionId,
                        item,
                    );
                return nestedGroup ? [...acc, nestedGroup] : acc;
            }

            return this.isFilterOnPopComparisonTimeDimension(
                item,
                timeDimensionId,
            )
                ? acc
                : [...acc, item];
        }, []);

        if (filteredItems.length === 0) {
            return undefined;
        }

        return isAndFilterGroup(filterGroup)
            ? {
                  ...filterGroup,
                  and: filteredItems,
              }
            : {
                  ...filterGroup,
                  or: filteredItems,
              };
    }

    private getPopDimensionsFilterSQL(
        timeDimensionId: string,
    ): string | undefined {
        const strippedGroup =
            this.getDimensionsFilterGroupWithoutPopTimeFilters(
                timeDimensionId,
                this.args.compiledMetricQuery.filters.dimensions,
            );
        return this.buildDimensionsWhereClause(strippedGroup);
    }

    private getDimensionsFilterSQL(): string | undefined {
        return this.buildDimensionsWhereClause(
            this.args.compiledMetricQuery.filters.dimensions,
        );
    }

    /**
     * Rewrites `compiledSql` with the project-TZ wrap for truncatable and
     * extractable intervals.
     *
     * Base dims with `convert_timezone: false` are skipped — the dim renders
     * in its raw warehouse value. Pass `respectConvertTimezone: false` from
     * filter rendering so WHERE clauses keep wrapping regardless.
     */
    private getTimezoneAwareDimensionSql(
        dimension: CompiledDimension,
        adapterType: SupportedDbtAdapter,
        startOfWeek: WeekDay | null | undefined,
        respectConvertTimezone: boolean = true,
    ): string {
        const { timezone, useTimezoneAwareDateTrunc } = this.args;

        if (!useTimezoneAwareDateTrunc || !dimension.timeInterval) {
            return dimension.compiledSql;
        }

        const isTruncatable = truncatableTimeFrames.has(dimension.timeInterval);
        const isExtractable = extractableTimeFrames.has(dimension.timeInterval);
        if (!isTruncatable && !isExtractable) {
            return dimension.compiledSql;
        }

        const baseDimensionId = dimension.timeIntervalBaseDimensionName
            ? `${dimension.table}_${dimension.timeIntervalBaseDimensionName}`
            : undefined;

        const baseDimension = baseDimensionId
            ? this.exploreDimensions[baseDimensionId]
            : undefined;

        // DATE base: no time component to shift, so the wrap would drift at midnight.
        if (
            !baseDimension?.compiledSql ||
            baseDimension.type !== DimensionType.TIMESTAMP
        ) {
            return dimension.compiledSql;
        }

        if (respectConvertTimezone && baseDimension.skipTimezoneConversion) {
            return dimension.compiledSql;
        }

        if (isTruncatable) {
            return getSqlForTruncatedDate(
                adapterType,
                dimension.timeInterval,
                baseDimension.compiledSql,
                baseDimension.type,
                startOfWeek,
                timezone,
                this.columnTimezone,
            );
        }

        return timeFrameConfigs[dimension.timeInterval].getSql(
            adapterType,
            dimension.timeInterval,
            baseDimension.compiledSql,
            baseDimension.type,
            startOfWeek,
            timezone,
            this.columnTimezone,
        );
    }

    private buildDimensionsWhereClause(
        dimensionsFilterGroup?: FilterGroup,
    ): string | undefined {
        const {
            explore,
            warehouseSqlBuilder,
            userAttributes = {},
            intrinsicUserAttributes,
        } = this.args;

        const requiredDimensionFilterSql =
            this.getNestedDimensionFilterSQLFromModelFilters(
                explore.tables[explore.baseTable],
                dimensionsFilterGroup,
            );
        const tableCompiledSqlWhere =
            explore.tables[explore.baseTable].sqlWhere;

        const tableSqlWhereWithReplacedAttributes = tableCompiledSqlWhere
            ? [
                  replaceUserAttributesAsStrings(
                      tableCompiledSqlWhere,
                      intrinsicUserAttributes,
                      userAttributes,
                      warehouseSqlBuilder,
                  ),
              ]
            : [];

        const nestedFilterSql = this.getNestedFilterSQLFromGroup(
            dimensionsFilterGroup,
            FieldType.DIMENSION,
        );
        const requiredFiltersWhere = requiredDimensionFilterSql
            ? [requiredDimensionFilterSql]
            : [];
        const nestedFilterWhere = nestedFilterSql ? [nestedFilterSql] : [];
        const allSqlFilters = [
            ...tableSqlWhereWithReplacedAttributes,
            ...nestedFilterWhere,
            ...requiredFiltersWhere,
        ];

        return allSqlFilters.length > 0
            ? `WHERE ${allSqlFilters.join(' AND ')}`
            : undefined;
    }

    private getDimensionsSQL(): {
        ctes: string[];
        joins: string[];
        tables: string[];
        selects: Record<string, string>;
        groupBySQL: string | undefined;
        filtersSQL: string | undefined;
    } {
        const {
            explore,
            compiledMetricQuery,
            warehouseSqlBuilder,
            userAttributes = {},
            intrinsicUserAttributes,
        } = this.args;
        const adapterType: SupportedDbtAdapter =
            warehouseSqlBuilder.getAdapterType();
        const { dimensions, sorts, compiledCustomDimensions, filters } =
            compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
        const dimensionsObjects = dimensions
            .filter(
                (id) =>
                    !compiledCustomDimensions.map((cd) => cd.id).includes(id),
            ) // exclude custom dimensions as they are handled separately
            .map((field) => {
                try {
                    const dimension = getDimensionFromId({
                        dimId: field,
                        dimensions: this.exploreDimensions,
                        dimensionsWithoutAccess:
                            this.exploreDimensionsWithoutAccess,
                        adapterType,
                        startOfWeek,
                        timezone: this.timezoneForDateTrunc,
                        columnTimezone: this.columnTimezone,
                    });

                    assertValidDimensionRequiredAttribute(
                        dimension,
                        userAttributes,
                        `dimension: "${field}"`,
                    );
                    return dimension;
                } catch (error) {
                    if (
                        this.args.continueOnError &&
                        error instanceof FieldReferenceError
                    ) {
                        this.compilationErrors.push(error.message);
                        return null; // Skip this dimension
                    }
                    throw error;
                }
            })
            .filter((dim): dim is CompiledDimension => dim !== null);
        const selectedCustomDimensions = compiledCustomDimensions.filter((cd) =>
            dimensions.includes(cd.id),
        );
        const customBinDimensionSql = getCustomBinDimensionSql({
            warehouseSqlBuilder,
            explore,
            customDimensions:
                selectedCustomDimensions?.filter(isCustomBinDimension),
            intrinsicUserAttributes,
            userAttributes,
        });
        const customSqlDimensionSql = getCustomSqlDimensionSql({
            warehouseSqlBuilder,
            customDimensions: selectedCustomDimensions?.filter(
                isCompiledCustomSqlDimension,
            ),
        });

        // CTEs
        const ctes = [];
        if (customBinDimensionSql?.ctes) {
            ctes.push(...customBinDimensionSql.ctes);
        }

        // Joins
        const joins = [];
        if (customBinDimensionSql?.join) {
            joins.push(customBinDimensionSql.join);
        }

        // Tables
        const tables = dimensionsObjects.reduce<string[]>(
            (acc, dim) => [...acc, ...(dim.tablesReferences || [dim.table])],
            [],
        );
        if (customBinDimensionSql?.tables) {
            tables.push(...customBinDimensionSql.tables);
        }
        if (customSqlDimensionSql?.tables) {
            tables.push(...customSqlDimensionSql.tables);
        }
        // Add tables referenced in dimension filters
        getFilterRulesFromGroup(filters.dimensions)
            .reduce<string[]>((acc, filterRule) => {
                try {
                    const dim = getDimensionFromFilterTargetId({
                        filterTargetId: filterRule.target.fieldId,
                        dimensions: this.exploreDimensions,
                        dimensionsWithoutAccess:
                            this.exploreDimensionsWithoutAccess,
                        compiledCustomDimensions:
                            compiledCustomDimensions.filter(
                                isCompiledCustomSqlDimension,
                            ),
                        adapterType,
                        startOfWeek,
                    });
                    return [...acc, ...(dim.tablesReferences || [dim.table])];
                } catch (error) {
                    if (
                        this.args.continueOnError &&
                        error instanceof FieldReferenceError
                    ) {
                        this.compilationErrors.push(error.message);
                        return acc; // Skip this filter's table references
                    }
                    throw error;
                }
            }, [])
            .forEach((table) => {
                tables.push(table);
            });

        // Selects
        const selects: Record<string, string> = {};

        dimensionsObjects.forEach((dimension) => {
            const id = getItemId(dimension);
            const quotedAlias = `${fieldQuoteChar}${id}${fieldQuoteChar}`;
            const sql = this.getTimezoneAwareDimensionSql(
                dimension,
                adapterType,
                startOfWeek,
            );
            selects[id] = `  ${sql} AS ${quotedAlias}`;
        });

        if (customBinDimensionSql?.selects) {
            Object.assign(selects, customBinDimensionSql.selects);
        }
        if (customSqlDimensionSql?.selects) {
            Object.assign(selects, customSqlDimensionSql.selects);
        }

        const selectsArray = Object.values(selects);
        const groupBySQL =
            selectsArray.length > 0
                ? `GROUP BY ${selectsArray.map((val, i) => i + 1).join(',')}`
                : undefined;

        // Filters
        const filtersSQL = this.getDimensionsFilterSQL();

        return {
            ctes,
            joins,
            tables,
            selects,
            groupBySQL,
            filtersSQL,
        };
    }

    /**
     * Returns the list of PostCalculation metrics.
     * @private
     */
    private getPostCalculationMetrics(): string[] {
        const { compiledMetricQuery } = this.args;
        const { metrics } = compiledMetricQuery;
        return metrics.filter((metricId) => {
            const metric = this.getMetricFromId(metricId);
            return isPostCalculationMetric(metric);
        });
    }

    /**
     * Returns the list of metrics that are referenced in PostCalculation metrics.
     * @param metricIds
     * @private
     */
    private getPostCalculationMetricReferences(metricIds: string[]): string[] {
        const referencedMetricIds = new Set<string>();
        metricIds.forEach((metricId) => {
            const metric = this.getMetricFromId(metricId);
            if (isPostCalculationMetric(metric)) {
                // Extract referenced metrics from PostCalculation metric SQL
                const references = parseAllReferences(metric.sql, metric.table);
                references.forEach((ref) => {
                    const referencedMetricId = getItemId({
                        table: ref.refTable,
                        name: ref.refName,
                    });
                    const referencedMetric =
                        this.getMetricFromId(referencedMetricId);
                    if (isPostCalculationMetric(referencedMetric)) {
                        throw new CompileError(
                            `PostCalculation metric "${metric.label}" cannot reference another PostCalculation metric "${referencedMetric.label}". PostCalculation metrics can only reference numeric aggregate metrics.`,
                        );
                    }
                    referencedMetricIds.add(referencedMetricId);
                });
            } else {
                // skip other metrics
            }
        });
        return Array.from(referencedMetricIds);
    }

    /**
     * Returns the list of metrics that are selected and referenced in the metric query.
     * This includes metrics in the final result, metrics from filters, and metrics referenced in PostCalculation metrics.
     * This excludes PostCalculation metrics.
     * @private
     */
    private getSelectedAndReferencedMetricIds(): string[] {
        const { compiledMetricQuery } = this.args;
        const { metrics, filters } = compiledMetricQuery;

        // Regular metrics
        const referencedMetricIds = new Set<string>(
            metrics.filter((metricId) => !this.isPopMetricId(metricId)),
        );

        // Add metrics from filters
        getFilterRulesFromGroup(filters.metrics).forEach((filter) =>
            referencedMetricIds.add(filter.target.fieldId),
        );

        // Add metrics referenced in PostCalculation metrics
        this.getPostCalculationMetricReferences(
            Array.from(referencedMetricIds),
        ).forEach((metricId) => {
            referencedMetricIds.add(metricId);
        });

        // Recursively resolve non-aggregate (type:number) metric references.
        // When a type:number metric references another type:number metric
        // (e.g. ratio_metric → count_if_metric → max_metric), the
        // intermediate metrics must be in the list so the nested aggregate
        // detection can see and handle them.
        const resolveNonAggregateRefs = (metricId: string): void => {
            let metric: CompiledMetric;
            try {
                metric = this.getMetricFromId(metricId);
            } catch {
                return;
            }
            if (!isNonAggregateMetric(metric)) return;

            const refs = parseAllReferences(metric.sql, metric.table);
            for (const ref of refs) {
                if (
                    ref.refName !== 'TABLE' &&
                    !referencedMetricIds.has(
                        getItemId({ table: ref.refTable, name: ref.refName }),
                    )
                ) {
                    const refMetricId = getItemId({
                        table: ref.refTable,
                        name: ref.refName,
                    });
                    try {
                        const refMetric = this.getMetricFromId(refMetricId);
                        // Only add metric references (not dimensions)
                        if (refMetric.fieldType === FieldType.METRIC) {
                            referencedMetricIds.add(refMetricId);
                            resolveNonAggregateRefs(refMetricId);
                        }
                    } catch {
                        // Not a metric reference, skip
                    }
                }
            }
        };

        for (const metricId of Array.from(referencedMetricIds)) {
            resolveNonAggregateRefs(metricId);
        }

        // Exclude PostCalculation metrics
        return Array.from(referencedMetricIds).filter((metricId) => {
            const metric = this.getMetricFromId(metricId);
            return !isPostCalculationMetric(metric);
        });
    }

    /**
     * Returns the set of non-aggregate metric IDs whose SQL templates
     * reference at least one sum_distinct / average_distinct metric.
     * These metrics must be excluded from the regular SELECT and instead
     * handled in the dd CTE outer SELECT so their references can be
     * rewritten to point at the deduplication CTE aliases.
     */
    private getNonAggregateMetricsReferencingDistinct(): Set<string> {
        const allMetricIds = this.getSelectedAndReferencedMetricIds();
        const ddMetricIds = new Set(
            allMetricIds.filter((id) => {
                try {
                    const m = this.getMetricFromId(id);
                    return (
                        m.type === MetricType.SUM_DISTINCT ||
                        m.type === MetricType.AVERAGE_DISTINCT
                    );
                } catch {
                    return false;
                }
            }),
        );
        if (ddMetricIds.size === 0) return new Set();

        const result = new Set<string>();
        for (const metricId of allMetricIds) {
            try {
                const metric = this.getMetricFromId(metricId);
                if (isNonAggregateMetric(metric)) {
                    const refs = parseAllReferences(metric.sql, metric.table);
                    for (const ref of refs) {
                        const refId = getItemId({
                            table: ref.refTable,
                            name: ref.refName,
                        });
                        if (ddMetricIds.has(refId)) {
                            result.add(metricId);
                            break;
                        }
                    }
                }
            } catch {
                // skip
            }
        }
        return result;
    }

    private getMetricsSQL(): {
        tables: string[];
        selects: string[];
        filtersSQL: string | undefined;
    } {
        const {
            compiledMetricQuery,
            warehouseSqlBuilder,
            userAttributes = {},
        } = this.args;
        const { filters, additionalMetrics } = compiledMetricQuery;
        const metrics = this.getSelectedAndReferencedMetricIds();
        const adapterType: SupportedDbtAdapter =
            warehouseSqlBuilder.getAdapterType();
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();

        // Validate custom metrics
        if (additionalMetrics) {
            additionalMetrics.forEach((metric) => {
                if (
                    metric.baseDimensionName === undefined ||
                    !metrics.includes(`${metric.table}_${metric.name}`)
                )
                    return;

                const dimensionId = getCustomMetricDimensionId(metric);
                const dimension = getDimensionFromId({
                    dimId: dimensionId,
                    dimensions: this.exploreDimensions,
                    dimensionsWithoutAccess:
                        this.exploreDimensionsWithoutAccess,
                    adapterType,
                    startOfWeek,
                    timezone: this.timezoneForDateTrunc,
                    columnTimezone: this.columnTimezone,
                });

                assertValidDimensionRequiredAttribute(
                    dimension,
                    userAttributes,
                    `custom metric: "${metric.name}"`,
                );
            });
        }

        const selects = new Set<string>();
        const tables = new Set<string>();
        const nestedAggMetrics = this.getMetricsWithNestedAggregates();
        const nestedAggOuterIds = new Set(
            nestedAggMetrics.map(({ outerMetricId }) => outerMetricId),
        );
        // Exclude ALL inner deps from the regular SELECT — both raw and
        // aggregate. Raw deps can't appear in GROUP BY, and aggregate deps
        // are pre-computed in CTE 1. Without this, aggregate inner deps
        // would appear twice: once from the CTE and once from the regular
        // SELECT, causing duplicate column errors.
        const innerDepIds = new Set<string>();
        for (const { innerDeps } of nestedAggMetrics) {
            for (const dep of innerDeps) {
                if (!nestedAggOuterIds.has(dep.fieldId)) {
                    innerDepIds.add(dep.fieldId);
                }
            }
        }
        // Non-aggregate metrics that reference sum_distinct/average_distinct
        // metrics are handled in the dd CTE outer SELECT so their references
        // can be rewritten to point at the deduplication CTE aliases.
        const nonAggReferencingDd =
            this.getNonAggregateMetricsReferencingDistinct();

        metrics.forEach((field) => {
            try {
                const alias = field;
                const metric = this.getMetricFromId(field);
                // Distinct metrics are handled separately via CTE
                if (
                    metric.type === MetricType.SUM_DISTINCT ||
                    metric.type === MetricType.AVERAGE_DISTINCT
                ) {
                    // Still track table references for JOIN generation
                    (metric.tablesReferences || [metric.table]).forEach(
                        (table) => tables.add(table),
                    );
                    return;
                }
                // Metrics with nested aggregate dependencies are handled via CTE
                if (nestedAggOuterIds.has(field) || innerDepIds.has(field)) {
                    (metric.tablesReferences || [metric.table]).forEach(
                        (table) => tables.add(table),
                    );
                    return;
                }
                // Non-aggregate metrics referencing distinct metrics are
                // handled in the dd CTE outer SELECT
                if (nonAggReferencingDd.has(field)) {
                    (metric.tablesReferences || [metric.table]).forEach(
                        (table) => tables.add(table),
                    );
                    return;
                }
                // Add select
                selects.add(
                    `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`,
                );
                // Add tables
                (metric.tablesReferences || [metric.table]).forEach((table) =>
                    tables.add(table),
                );
            } catch (error) {
                if (
                    this.args.continueOnError &&
                    error instanceof FieldReferenceError
                ) {
                    this.compilationErrors.push(error.message);
                    // Skip this metric
                } else {
                    throw error;
                }
            }
        });

        // Filters
        const filtersSQL = this.getNestedFilterSQLFromGroup(
            filters.metrics,
            FieldType.METRIC,
        );

        return {
            selects: Array.from(selects),
            tables: Array.from(tables),
            filtersSQL: filtersSQL ? `WHERE ${filtersSQL}` : undefined,
        };
    }

    private hasAnyTableCalcs(): boolean {
        return (
            this.args.compiledMetricQuery.compiledTableCalculations.length > 0
        );
    }

    static hasMetricFilters(metricsSQL: { filtersSQL?: string }): boolean {
        return Boolean(metricsSQL.filtersSQL);
    }

    private needsPostAggCte(opts: {
        requiresQueryInCTE: boolean;
        metricsSQL: { filtersSQL?: string };
    }): boolean {
        const postCalculationMetrics = this.getPostCalculationMetrics();
        return (
            opts.requiresQueryInCTE ||
            this.hasAnyTableCalcs() ||
            MetricQueryBuilder.hasMetricFilters(opts.metricsSQL) ||
            postCalculationMetrics.length > 0
        );
    }

    private createSimpleTableCalculationSelects(
        simpleTableCalcs: CompiledTableCalculation[],
    ): string[] {
        const { warehouseSqlBuilder } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const orderByClause = this.buildWindowOrderByClause();

        return simpleTableCalcs.map((tableCalculation) => {
            const alias = tableCalculation.name;

            // Replace total()/row_total() refs with column aliases before function parsing
            const preprocessedSql = this.replaceTotalReferences(
                tableCalculation.compiledSql,
            );

            const functions = parseTableCalculationFunctions(preprocessedSql);

            let tablCalcSql: string | null;
            if (hasPivotFunctions(functions)) {
                tablCalcSql = null;
            } else if (hasRowFunctions(functions)) {
                const compiler = new TableCalculationFunctionCompiler(
                    warehouseSqlBuilder,
                );
                tablCalcSql = compiler.compileFunctions(
                    preprocessedSql,
                    functions,
                    orderByClause,
                );
            } else {
                tablCalcSql = preprocessedSql;
            }

            return `  ${tablCalcSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
        });
    }

    private createTableCalculationFilters(): string | undefined {
        const { compiledMetricQuery } = this.args;
        const { filters } = compiledMetricQuery;

        const tableCalculationFilters = this.getNestedFilterSQLFromGroup(
            filters.tableCalculations,
        );

        return tableCalculationFilters
            ? ` WHERE ${tableCalculationFilters}`
            : undefined;
    }

    private getNestedDimensionFilterSQLFromModelFilters(
        table: CompiledTable,
        dimensionsFilterGroup: FilterGroup | undefined,
    ): string | undefined {
        const { explore } = this.args;
        // We only force required filters that are not explicitly set to false
        // requiredFilters with required:false will be added on the UI, but not enforced on the backend
        const modelFilterRules: MetricFilterRule[] | undefined =
            table.requiredFilters?.filter(
                (filter) => filter.required !== false,
            );

        if (!modelFilterRules) return undefined;

        const reducedRules: string[] = modelFilterRules.reduce<string[]>(
            (acc, filter) => {
                let dimension: CompiledDimension | undefined;

                // This function already takes care of falling back to the base table if the fieldRef doesn't have 2 parts (falls back to base table name)
                const filterRule = createFilterRuleFromModelRequiredFilterRule(
                    filter,
                    table.name,
                );

                if (isJoinModelRequiredFilter(filter)) {
                    const joinedTable = explore.tables[filter.target.tableName];

                    if (joinedTable) {
                        dimension = Object.values(joinedTable.dimensions).find(
                            (d) => getItemId(d) === filterRule.target.fieldId,
                        );
                    }
                } else {
                    dimension = Object.values(table.dimensions).find(
                        (tc) => getItemId(tc) === filterRule.target.fieldId,
                    );
                }

                if (!dimension) return acc;

                if (
                    isFilterRuleInQuery(
                        dimension,
                        filterRule,
                        dimensionsFilterGroup,
                        explore,
                    )
                )
                    return acc;

                const filterString = `( ${this.getFilterRuleSQL(
                    filterRule,
                    FieldType.DIMENSION,
                )} )`;
                return [...acc, filterString];
            },
            [],
        );

        return reducedRules.join(' AND ');
    }

    private getNestedFilterSQLFromGroup(
        filterGroup: FilterGroup | undefined,
        fieldType?: FieldType,
    ): string | undefined {
        if (filterGroup) {
            const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
            const items = isAndFilterGroup(filterGroup)
                ? filterGroup.and
                : filterGroup.or;
            if (items.length === 0) return undefined;
            const filterRules: string[] = items.reduce<string[]>(
                (sum, item) => {
                    const filterSql: string | undefined = isFilterGroup(item)
                        ? this.getNestedFilterSQLFromGroup(item, fieldType)
                        : `(\n  ${this.getFilterRuleSQL(item, fieldType)}\n)`;
                    return filterSql ? [...sum, filterSql] : sum;
                },
                [],
            );
            return filterRules.length > 0
                ? `(${filterRules.join(` ${operator} `)})`
                : undefined;
        }
        return undefined;
    }

    private getFilterRuleSQL(filter: FilterRule, fieldType?: FieldType) {
        const { explore, compiledMetricQuery, warehouseSqlBuilder, timezone } =
            this.args;
        const adapterType: SupportedDbtAdapter =
            warehouseSqlBuilder.getAdapterType();
        const { compiledCustomDimensions } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const stringQuoteChar = warehouseSqlBuilder.getStringQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
        const escapeString =
            warehouseSqlBuilder.escapeString.bind(warehouseSqlBuilder);
        // Replace parameter reference values with their actual values as raw sql
        // This is safe as raw because they will get quoted internally by the filter compiler
        const filterRuleWithParamReplacedValues: FilterRule = {
            ...filter,
            values: filter.values?.map((value) => {
                if (typeof value === 'string') {
                    const { replacedSql } = unsafeReplaceParametersAsRaw(
                        value,
                        this.args.parameters ?? {},
                        this.args.warehouseSqlBuilder,
                    );
                    // Replace user attribute references (e.g., ${lightdash.user.email})
                    // Raw replacement is safe because the filter compiler handles quoting
                    return replaceUserAttributesRaw(
                        replacedSql,
                        this.args.intrinsicUserAttributes,
                        this.args.userAttributes ?? {},
                    );
                }
                return value;
            }),
        };

        // Helper to handle filter rendering with continueOnError error handling
        const renderWithErrorHandling = (renderFn: () => string): string => {
            if (this.args.continueOnError) {
                try {
                    return renderFn();
                } catch (error) {
                    if (error instanceof CompileError) {
                        this.compilationErrors.push(error.message);
                        // Return raw filter SQL with values as-is for debugging
                        const rawValues =
                            filterRuleWithParamReplacedValues.values
                                ?.map((v) => JSON.stringify(v))
                                .join(', ');
                        return `/* ERROR: ${error.message} */ ${filterRuleWithParamReplacedValues.target.fieldId} ${filterRuleWithParamReplacedValues.operator} (${rawValues})`;
                    }
                    throw error;
                }
            }
            return renderFn();
        };

        if (!fieldType) {
            const field = compiledMetricQuery.compiledTableCalculations?.find(
                (tc) =>
                    getItemId(tc) ===
                    filterRuleWithParamReplacedValues.target.fieldId,
            );
            return renderWithErrorHandling(() =>
                renderTableCalculationFilterRuleSql(
                    filterRuleWithParamReplacedValues,
                    field,
                    fieldQuoteChar,
                    stringQuoteChar,
                    escapeString,
                    adapterType,
                    startOfWeek,
                    timezone,
                ),
            );
        }

        // Use the original (pre-date-zoom) explore for filter dimension lookups
        // so that WHERE clauses compare against the raw column, not DATE_TRUNC'd expressions
        const filterExplore = this.args.originalExplore ?? explore;
        const field =
            fieldType === FieldType.DIMENSION
                ? [
                      ...getDimensions(filterExplore),
                      ...compiledCustomDimensions.filter(
                          isCompiledCustomSqlDimension,
                      ),
                  ].find(
                      (d) =>
                          getItemId(d) ===
                          filterRuleWithParamReplacedValues.target.fieldId,
                  )
                : this.getMetricFromId(
                      filterRuleWithParamReplacedValues.target.fieldId,
                  );
        if (!field) {
            const errorMessage = `Filter has a reference to an unknown ${fieldType}: ${filterRuleWithParamReplacedValues.target.fieldId}`;
            if (this.args.continueOnError) {
                this.compilationErrors.push(errorMessage);
                const rawValues = filterRuleWithParamReplacedValues.values
                    ?.map((v) => JSON.stringify(v))
                    .join(', ');
                return `/* ERROR: ${errorMessage} */ ${filterRuleWithParamReplacedValues.target.fieldId} ${filterRuleWithParamReplacedValues.operator} (${rawValues})`;
            }
            throw new FieldReferenceError(errorMessage);
        }

        // Override filter dimension SQL to match the timezone-aware SELECT
        // clause. Filters always wrap by project tz — even for dims with
        // `convert_timezone: false` — so pass `respectConvertTimezone: false`.
        const filterField = isDimension(field)
            ? {
                  ...field,
                  compiledSql: this.getTimezoneAwareDimensionSql(
                      field,
                      adapterType,
                      startOfWeek,
                      false,
                  ),
              }
            : field;

        // For period-to-date filters on truncated dimensions, resolve the
        // base (raw) dimension SQL so EXTRACT operates on the actual date
        let baseDimensionSql: string | undefined;
        if (
            filterRuleWithParamReplacedValues.operator ===
                FilterOperator.IN_PERIOD_TO_DATE &&
            'timeIntervalBaseDimensionName' in field &&
            field.timeIntervalBaseDimensionName
        ) {
            const baseDimension = getDimensions(filterExplore).find(
                (d) =>
                    getItemId(d) ===
                    getItemId({
                        table: (field as CompiledDimension).table,
                        name: field.timeIntervalBaseDimensionName!,
                    }),
            );
            if (baseDimension) {
                baseDimensionSql = baseDimension.compiledSql;
            }
        }

        const renderedFilterSql = renderWithErrorHandling(() =>
            renderFilterRuleSqlFromField(
                filterRuleWithParamReplacedValues,
                filterField,
                fieldQuoteChar,
                stringQuoteChar,
                escapeString,
                startOfWeek,
                adapterType,
                timezone,
                this.args.explore.caseSensitive ?? true,
                baseDimensionSql,
                this.args.useTimezoneAwareDateTrunc,
            ),
        );

        Logger.info('query.case_sensitive_applied', {
            exploreName: explore.name,
            ruleCaseSensitive:
                filterRuleWithParamReplacedValues.caseSensitive ?? null,
            fieldCaseSensitive:
                'caseSensitive' in field ? (field.caseSensitive ?? null) : null,
            exploreCaseSensitive: this.args.explore.caseSensitive ?? null,
            fieldId: getItemId(field),
            finalSqlContainsUpper: /UPPER\s*\(/i.test(renderedFilterSql),
        });

        return renderedFilterSql;
    }

    static getNullsFirstLast(sort: SortField) {
        if (sort.nullsFirst === undefined) return '';
        return sort.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
    }

    /**
     * Gets the default sort field when no sorts are specified.
     * Priority order:
     * 1. Time dimension (DATE/TIMESTAMP) - descending
     * 2. First metric - descending
     * 3. First dimension - ascending
     */
    private getDefaultSort(): SortField | undefined {
        const { compiledMetricQuery } = this.args;
        const { dimensions, metrics } = compiledMetricQuery;

        if (dimensions.length === 0) {
            // No dimensions means the query returns a single aggregated row,
            // so sorting is meaningless. This also prevents ORDER BY errors
            // on non-sortable types (e.g., BigQuery ARRAY<INT64>).
            return undefined;
        }

        // Priority 1: Time dimension (DATE or TIMESTAMP)
        const selectedDimensions = dimensions
            .map((dimId) => this.exploreDimensions[dimId])
            .filter(Boolean);

        const timeDimension = selectedDimensions.find(({ type }) =>
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(type),
        );

        if (timeDimension) {
            return {
                fieldId: getItemId(timeDimension),
                descending: true,
            };
        }

        // Priority 2: First metric
        if (metrics.length > 0) {
            const firstMetricId = metrics[0];
            return {
                fieldId: firstMetricId,
                descending: true,
            };
        }

        // Priority 3: First dimension
        if (dimensions.length > 0) {
            const firstDimensionId = dimensions[0];
            return {
                fieldId: firstDimensionId,
                descending: false,
            };
        }

        return undefined;
    }

    private getSortSQL(excludePostCalculationMetrics: boolean = false) {
        const { compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const { sorts, metrics, compiledCustomDimensions } =
            compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
        let requiresQueryInCTE = false;

        // Apply default sort if no sorts are specified
        let effectiveSorts: SortField[] = sorts;
        if (sorts.length === 0) {
            const defaultSort = this.getDefaultSort();
            effectiveSorts = defaultSort ? [defaultSort] : [];
        }

        const fieldOrders = effectiveSorts.reduce<string[]>((acc, sort) => {
            // Default sort
            let fieldSort: string = `${fieldQuoteChar}${
                sort.fieldId
            }${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }${MetricQueryBuilder.getNullsFirstLast(sort)}`;

            const sortedDimension = this.exploreDimensions[sort.fieldId];

            if (
                compiledCustomDimensions &&
                compiledCustomDimensions.find(
                    (customDimension) =>
                        getItemId(customDimension) === sort.fieldId &&
                        isCustomBinDimension(customDimension),
                )
            ) {
                // Custom dimensions will have a separate `select` for ordering,
                // that returns the min value (int) of the bin, rather than a string,
                // so we can use it for sorting
                fieldSort = `${fieldQuoteChar}${
                    sort.fieldId
                }_order${fieldQuoteChar}${
                    sort.descending ? ' DESC' : ''
                }${MetricQueryBuilder.getNullsFirstLast(sort)}`;
            } else if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.MONTH_NAME
            ) {
                requiresQueryInCTE = true;

                fieldSort = sortMonthName(
                    sortedDimension,
                    warehouseSqlBuilder.getFieldQuoteChar(),
                    sort.descending,
                );
            } else if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.DAY_OF_WEEK_NAME
            ) {
                // in BigQuery, we cannot use a function in the ORDER BY clause that references a column that is not aggregated or grouped
                // so we need to wrap the query in a CTE to allow us to reference the column in the ORDER BY clause
                // for consistency, we do it for all warehouses
                requiresQueryInCTE = true;
                fieldSort = sortDayOfWeekName(
                    sortedDimension,
                    startOfWeek,
                    warehouseSqlBuilder.getFieldQuoteChar(),
                    sort.descending,
                );
            } else if (
                excludePostCalculationMetrics &&
                metrics.includes(sort.fieldId)
            ) {
                const metric = this.getMetricFromId(sort.fieldId);
                if (isPostCalculationMetric(metric)) {
                    // Skip sorting by PostCalculation metrics
                    return acc;
                }
            }
            acc.push(fieldSort);
            return acc;
        }, []);

        const sqlOrderBy =
            fieldOrders.length > 0
                ? `ORDER BY ${fieldOrders.join(', ')}`
                : undefined;
        return {
            sqlOrderBy,
            requiresQueryInCTE,
        };
    }

    private buildWindowOrderByClause(): string | undefined {
        const { compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const { sorts, compiledCustomDimensions } = compiledMetricQuery;
        const q = warehouseSqlBuilder.getFieldQuoteChar();
        const customBinDimensions = new Set(
            compiledCustomDimensions
                .filter(isCustomBinDimension)
                .map(getItemId),
        );
        if (sorts.length === 0) return undefined;
        return sorts
            .map((s) => {
                const fieldId = customBinDimensions.has(s.fieldId)
                    ? `${s.fieldId}_order`
                    : s.fieldId;
                return `${q}${fieldId}${q}${s.descending ? ' DESC' : ''}`;
            })
            .join(', ');
    }

    private getLimitSQL() {
        const { limit } = this.args.compiledMetricQuery;
        return limit !== undefined ? `LIMIT ${limit}` : undefined;
    }

    private getBaseTableFromSQL() {
        const {
            explore,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes = {},
        } = this.args;
        const baseTable = replaceUserAttributesRaw(
            explore.tables[explore.baseTable].sqlTable,
            intrinsicUserAttributes,
            userAttributes,
        );
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        return `FROM ${baseTable} AS ${fieldQuoteChar}${explore.baseTable}${fieldQuoteChar}`;
    }

    private getJoinsSQL({
        tablesReferencedInDimensions,
        tablesReferencedInMetrics,
    }: {
        tablesReferencedInDimensions: string[];
        tablesReferencedInMetrics: string[];
    }): {
        joinSQL: string;
        tables: Set<string>;
    } {
        const {
            explore,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes = {},
        } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        const selectedTables = new Set<string>([
            ...tablesReferencedInDimensions,
            ...tablesReferencedInMetrics,
        ]);

        const tableSqlWhere =
            explore.tables[explore.baseTable].uncompiledSqlWhere;

        const tableSqlWhereTableReferences = tableSqlWhere
            ? parseAllReferences(tableSqlWhere, explore.baseTable)
            : undefined;

        const tablesFromTableSqlWhereFilter = tableSqlWhereTableReferences
            ? tableSqlWhereTableReferences.map((ref) => ref.refTable)
            : [];

        const requiredFilterJoinedTables =
            explore.tables[explore.baseTable].requiredFilters
                ?.map((filter) => {
                    if (isJoinModelRequiredFilter(filter)) {
                        return filter.target.tableName;
                    }
                    return undefined;
                })
                .filter((s): s is string => Boolean(s)) || [];

        const joinedTables = new Set([
            ...selectedTables,
            ...getJoinedTables(explore, [...selectedTables]),
            ...tablesFromTableSqlWhereFilter,
            ...requiredFilterJoinedTables,
        ]);

        const joinSQL = explore.joinedTables
            .filter((join) => joinedTables.has(join.table) || join.always)
            .map((join) => {
                const joinTable = replaceUserAttributesRaw(
                    explore.tables[join.table].sqlTable,
                    intrinsicUserAttributes,
                    userAttributes,
                );
                const joinType = getJoinType(join.type);

                const alias = join.table;
                const parsedSqlOn = replaceUserAttributesAsStrings(
                    join.compiledSqlOn,
                    intrinsicUserAttributes,
                    userAttributes,
                    warehouseSqlBuilder,
                );

                return `${joinType} ${joinTable} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}\n  ON ${parsedSqlOn}`;
            })
            .join('\n');

        return {
            joinSQL,
            tables: joinedTables,
        };
    }

    private getWarnings({ joinedTables }: { joinedTables: Set<string> }) {
        const { explore, compiledMetricQuery } = this.args;
        const { metrics } = compiledMetricQuery;
        let warnings: QueryWarning[] = [];
        try {
            warnings = findMetricInflationWarnings({
                tables: explore.tables,
                possibleJoins: explore.joinedTables,
                baseTable: explore.baseTable,
                joinedTables,
                metrics: metrics.map((field) => this.getMetricFromId(field)),
            });
        } catch (e) {
            // Log error but don't block code execution
            Logger.error('Error during metric inflation detection', e);
        }
        return warnings;
    }

    /**
     * Helper function to replace metric references in SQL with CTE references
     */
    private replaceMetricReferencesWithCteReferences(
        metric: CompiledMetric,
        metricCtes: Array<{ name: string; metrics: string[] }>,
    ): string {
        const { explore, warehouseSqlBuilder } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const cteName = metricCtes[0]?.name;

        // Phase 1: Replace ${TABLE}.column patterns with CTE dimension aliases.
        // Inside nested_agg_results, only the CTE is in scope (FROM nested_agg),
        // so ${TABLE}.column must resolve to e.g. nested_agg."my_table_category"
        // instead of "my_table".category (GH-21089).
        let processedSql = metric.sql;
        if (cteName) {
            const table = explore.tables[metric.table];
            if (table) {
                // Map raw column names to dimension aliases in the CTE
                const columnToDimAlias = new Map<string, string>();
                for (const [dimName, dim] of Object.entries(table.dimensions)) {
                    const match = dim.sql.match(/^\$\{TABLE\}\.(\w+)$/);
                    if (match) {
                        const columnName = match[1];
                        const dimId = getItemId({
                            table: metric.table,
                            name: dimName,
                        });
                        columnToDimAlias.set(columnName, dimId);
                    }
                }

                processedSql = processedSql.replace(
                    /\$\{TABLE\}\.(\w+)/g,
                    (fullMatch, columnName) => {
                        const dimAlias = columnToDimAlias.get(columnName);
                        if (dimAlias) {
                            return `${cteName}.${fieldQuoteChar}${dimAlias}${fieldQuoteChar}`;
                        }
                        return fullMatch;
                    },
                );
            }
        }

        // Phase 2: Replace metric and dimension references with CTE references
        processedSql = processedSql.replace(
            lightdashVariablePattern,
            (fullmatch, ref) => {
                if (ref === 'TABLE') {
                    // Standalone ${TABLE} not followed by .column — leave for
                    // compileMetricSql to handle
                    return fullmatch;
                }

                const { refTable, refName } = getParsedReference(
                    ref,
                    metric.table,
                );
                const itemId = getItemId({ table: refTable, name: refName });

                // Check if it's a metric in a CTE
                const containingCte = metricCtes.find((cte) =>
                    cte.metrics.includes(itemId),
                );
                if (containingCte) {
                    return `${containingCte.name}.${fieldQuoteChar}${itemId}${fieldQuoteChar}`;
                }

                // Check if it's a dimension — resolve to CTE alias
                const referencedTable = explore.tables[refTable];
                if (cteName && referencedTable?.dimensions[refName]) {
                    return `${cteName}.${fieldQuoteChar}${itemId}${fieldQuoteChar}`;
                }

                return fullmatch;
            },
        );

        // Handle any remaining references that weren't resolved above
        const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
        const compiledMetric = exploreCompiler.compileMetricSql(
            { ...metric, sql: processedSql },
            explore.tables,
            Object.keys(this.args.parameterDefinitions),
        );

        return compiledMetric.sql;
    }

    private getExperimentalMetricsCteSQL({
        joinedTables,
        dimensionSelects,
        dimensionFilters,
        dimensionGroupBy,
        sqlFrom,
        joins,
    }: {
        joinedTables: Set<string>;
        dimensionSelects: Record<string, string>;
        dimensionFilters: string | undefined;
        dimensionGroupBy: string | undefined;
        sqlFrom: string;
        joins: string[];
    }) {
        const {
            explore,
            compiledMetricQuery,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes = {},
        } = this.args;
        const { metrics, filters } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const adapterType: SupportedDbtAdapter =
            warehouseSqlBuilder.getAdapterType();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();

        // Find tables that potentially have metric inflation and tables without relationship value
        const { tablesWithMetricInflation, joinWithoutRelationship } =
            findTablesWithMetricInflation({
                tables: explore.tables,
                possibleJoins: explore.joinedTables,
                baseTable: explore.baseTable,
                joinedTables,
            });

        // Get filter-only metrics (metrics used in filters but not selected for display)
        const filterOnlyMetricIds = getFilterRulesFromGroup(filters.metrics)
            .map((filter) => filter.target.fieldId)
            .filter((metricId) => !metrics.includes(metricId));

        // Include both selected metrics AND filter-only metrics for fanout protection
        const allMetricsToProcess = [...metrics, ...filterOnlyMetricIds];
        const metricsObjects = allMetricsToProcess.map((field) =>
            this.getMetricFromId(field),
        );
        const nestedAggOuterIds = new Set(
            this.getMetricsWithNestedAggregates().map(
                ({ outerMetricId }) => outerMetricId,
            ),
        );
        // Non-aggregate metrics that reference a sum_distinct/average_distinct
        // metric must be projected from the outer dd_base SELECT (where the
        // dd_* CTE aliases exist), not inlined into this fanout flow's
        // finalMetricSelects. Inlining would expand the ${sum_distinct} ref
        // to its raw fallback SUM(...) referencing tables not in scope of
        // the dd_base CTE. See SPK-333.
        const nonAggReferencingDd =
            this.getNonAggregateMetricsReferencingDistinct();
        const metricsWithCteReferences: Array<CompiledMetric> = [];
        const referencedMetricObjects = metricsObjects.reduce<CompiledMetric[]>(
            (acc, metricObject) => {
                const referencesAnotherTable =
                    metricObject.tablesReferences?.some(
                        (table) => table !== metricObject.table,
                    );
                // If non-aggregate metric references joined tables, include referenced metrics
                // Note: does not handle nested references
                if (
                    isNonAggregateMetric(metricObject) &&
                    referencesAnotherTable
                ) {
                    // Defer dd-referencing metrics to the outer dd_base
                    // SELECT (see nonAggReferencingDd above), but still
                    // collect their transitively-referenced metrics so
                    // non-dd dependencies (e.g. the count_distinct in the
                    // denominator) still land in cte_unaffected/dd_base.
                    if (!nonAggReferencingDd.has(getItemId(metricObject))) {
                        metricsWithCteReferences.push(metricObject);
                    }
                    const metricReferences = parseAllReferences(
                        metricObject.sql,
                        metricObject.table,
                    );
                    metricReferences.forEach((metricReference) => {
                        const isInMetricsObjects = metricsObjects.some(
                            (metric) =>
                                getItemId(metric) ===
                                getItemId({
                                    table: metricReference.refTable,
                                    name: metricReference.refName,
                                }),
                        );
                        const isInReferencedMetricObjects = acc.some(
                            (metric) =>
                                getItemId(metric) ===
                                getItemId({
                                    table: metricReference.refTable,
                                    name: metricReference.refName,
                                }),
                        );
                        // Only add if doesn't exist in metricsObjects or referencedMetricObjects
                        if (
                            !isInMetricsObjects &&
                            !isInReferencedMetricObjects
                        ) {
                            acc.push(
                                this.getMetricFromId(
                                    getItemId({
                                        table: metricReference.refTable,
                                        name: metricReference.refName,
                                    }),
                                ),
                            );
                        }
                    });
                }
                return acc;
            },
            [],
        );

        // Warn user about metrics with fanouts which we don't have a solution for yet.
        const warnings: QueryWarning[] = [];
        const ctes: string[] = [];
        const metricCtes: Array<{ name: string; metrics: string[] }> = [];
        const popMetricCtes: Array<{
            name: string;
            metrics: string[];
            popConfig: {
                timeDimensionId: string;
                granularity: TimeFrames;
                periodOffset: number;
                configKey: string;
                cteSuffix: string;
            };
        }> = [];
        let finalSelectParts: Array<string | undefined> | undefined;

        // We can't handle deduplication for joins without relationship type
        joinWithoutRelationship.forEach((tableName) => {
            warnings.push({
                message: `Join **"${tableName}"** is missing a join relationship type. This can prevent data duplication in joins. [Read more](https://docs.lightdash.com/references/joins#sql-fanouts)`,
                tables: [tableName],
            });
            const metricsFromTable = [
                ...metricsObjects,
                ...referencedMetricObjects,
            ].filter((metric) => metric.table === tableName);
            metricsFromTable.forEach((metric) => {
                warnings.push({
                    message: `Metric **"${metric.label}"** could be inflated due to missing join relationship type. [Read more](https://docs.lightdash.com/references/joins#sql-fanouts)`,
                    fields: [getItemId(metric)],
                    tables: [metric.table],
                });
            });
        });

        // Get dimension aliases directly from the keys of the dimensionSelects record
        const dimensionAlias = Object.keys(dimensionSelects).map(
            (alias) => `${fieldQuoteChar}${alias}${fieldQuoteChar}`,
        );

        tablesWithMetricInflation.forEach((tableName) => {
            const table = explore.tables[tableName];
            const metricsFromTable = [
                ...metricsObjects,
                ...referencedMetricObjects,
            ].filter((metric) => metric.table === tableName);
            const metricsInCte: CompiledMetric[] = [];

            if (table?.primaryKey === undefined) {
                // We can't handle deduplication if table doesn't have primary key
                warnings.push({
                    message: `Table **"${tableName}"** is missing a primary key definition. This can prevent data duplication in joins. [Read more](https://docs.lightdash.com/references/joins#sql-fanouts)`,
                    tables: [tableName],
                });
                metricsFromTable.forEach((metric) => {
                    warnings.push({
                        message: `Metric **"${metric.label}"** could be inflated due to table missing primary key definition. [Read more](https://docs.lightdash.com/references/joins#sql-fanouts)`,
                        fields: [getItemId(metric)],
                        tables: [metric.table],
                    });
                });
                return;
            }

            metricsFromTable.forEach((metric) => {
                // Nested aggregate outer metrics are materialized by the
                // nested_agg CTE flow and must not also be emitted here.
                if (nestedAggOuterIds.has(getItemId(metric))) {
                    return;
                }
                // Inflation proof metrics don't need CTE
                if (isInflationProofMetric(metric.type)) {
                    return;
                }
                // Handle metrics that depend on other tables
                const referencesAnotherTable = metric.tablesReferences?.some(
                    (t) => t !== metric.table,
                );
                if (referencesAnotherTable) {
                    if (isNonAggregateMetric(metric)) {
                        // These will be part of the final select. The SQL will be processed later to replace metric references with CTE references
                        return;
                    }
                    // We don't support other scenarios yet
                    warnings.push({
                        message: `Metric **"${metric.label}"** that references a joined table might have inflation. [Read more](https://docs.lightdash.com/references/joins#metric-inflation-in-sql-joins)`,
                        fields: [getItemId(metric)],
                        tables: [metric.table],
                    });
                    return;
                }
                // Otherwise, we can calculate metric without fanout
                metricsInCte.push(metric);
            });

            if (metricsInCte.length > 0) {
                const { primaryKey } = table;
                if (!primaryKey) return;

                /**
                 * CTE to deduplicate rows
                 * - We always need to include all dimensions using the original SQL
                 * - We always need to include the primary keys to deduplicate!
                 * - Include all joins
                 * - Apply dimensions filters
                 */
                const keysCteName = `cte_keys_${snakeCaseName(tableName)}`;
                const keysCteParts = [
                    `SELECT DISTINCT`,
                    [
                        ...Object.values(dimensionSelects),
                        ...primaryKey.map(
                            (pk) =>
                                `  ${fieldQuoteChar}${table.name}${fieldQuoteChar}.${pk} AS ${fieldQuoteChar}pk_${pk}${fieldQuoteChar}`,
                        ),
                    ].join(',\n'),
                    sqlFrom,
                    ...joins,
                    dimensionFilters,
                ];
                ctes.push(
                    `${keysCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        keysCteParts,
                    )}\n)`,
                );

                /**
                 * CTE to calculate metrics
                 * - Include dimensions via alias
                 * - Only join keys table and metrics table
                 * - No filters needed
                 */
                const joinTable = replaceUserAttributesRaw(
                    table.sqlTable,
                    intrinsicUserAttributes,
                    userAttributes,
                );
                const metricsCteName = `cte_metrics_${snakeCaseName(
                    table.name,
                )}`;
                const metricsCteParts = [
                    `SELECT`,
                    [
                        ...dimensionAlias.map(
                            (alias) => `  ${keysCteName}.${alias}`,
                        ),
                        ...metricsInCte.map(
                            (metric) =>
                                `  ${
                                    metric.compiledSql
                                } AS ${fieldQuoteChar}${getItemId(
                                    metric,
                                )}${fieldQuoteChar}`,
                        ),
                    ].join(',\n'),
                    `FROM ${keysCteName}`,
                    `LEFT JOIN ${joinTable} AS ${fieldQuoteChar}${
                        table.name
                    }${fieldQuoteChar} ON ${primaryKey
                        .map(
                            (pk) =>
                                `${keysCteName}.${fieldQuoteChar}pk_${pk}${fieldQuoteChar} = ${fieldQuoteChar}${table.name}${fieldQuoteChar}.${pk}`,
                        )
                        .join(' AND ')}\n`,
                    dimensionAlias.length > 0
                        ? `GROUP BY ${dimensionAlias
                              .map((val, i) => i + 1)
                              .join(',')}`
                        : undefined,
                ];
                ctes.push(
                    `${metricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        metricsCteParts,
                    )}\n)`,
                );
                metricCtes.push({
                    name: metricsCteName,
                    metrics: metricsInCte.map((metric) => getItemId(metric)),
                });

                if (this.popComparisonConfigs.length > 0) {
                    const metricsInCteById = new Map(
                        metricsInCte.map((m) => [getItemId(m), m]),
                    );

                    this.popComparisonConfigs.forEach((cfg) => {
                        const popEntries =
                            this.popMetricEntriesByConfigKey[
                                cfg.configKey
                            ]?.filter((e) =>
                                metricsInCteById.has(e.baseMetricId),
                            ) ?? [];

                        if (popEntries.length === 0) return;

                        const popFieldId = cfg.timeDimensionId;
                        const popConfigSuffix = cfg.cteSuffix;

                        /**
                         * CTE to get min and max date in deduplicated keys
                         */
                        const popCteTablePart = snakeCaseName(tableName).slice(
                            0,
                            16,
                        );
                        const popMinMaxCteName = `cte_pop_min_max_${popCteTablePart}__${popConfigSuffix}`;
                        const popMinMaxCteParts = [
                            `SELECT`,
                            [
                                `MIN(${keysCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as min_date`,
                                `MAX(${keysCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as max_date`,
                            ].join(',\n'),
                            `FROM ${keysCteName}`,
                        ];
                        ctes.push(
                            `${popMinMaxCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                                popMinMaxCteParts,
                            )}\n)`,
                        );

                        /**
                         * CTE to deduplicate PoP keys
                         * Filters are PoP specific rather than metric query filters
                         */
                        const popKeysCteName = `cte_pop_keys_${popCteTablePart}__${popConfigSuffix}`;
                        const popField = getDimensionFromId({
                            dimId: popFieldId,
                            dimensions: this.exploreDimensions,
                            dimensionsWithoutAccess:
                                this.exploreDimensionsWithoutAccess,
                            adapterType,
                            startOfWeek,
                            timezone: this.timezoneForDateTrunc,
                            columnTimezone: this.columnTimezone,
                        });
                        const popDimensionFilters =
                            this.getPopDimensionsFilterSQL(popFieldId);
                        const popKeysCteParts = [
                            `SELECT DISTINCT`,
                            [
                                ...Object.values(dimensionSelects),
                                ...primaryKey.map(
                                    (pk) =>
                                        `  ${fieldQuoteChar}${table.name}${fieldQuoteChar}.${pk} AS ${fieldQuoteChar}pk_${pk}${fieldQuoteChar}`,
                                ),
                            ].join(',\n'),
                            sqlFrom,
                            ...[
                                ...joins,
                                `LEFT JOIN ${popMinMaxCteName} ON TRUE`,
                            ],
                            MetricQueryBuilder.combineWhereClauses(
                                popDimensionFilters,
                                `WHERE ${getIntervalSyntax(
                                    adapterType,
                                    popField.compiledSql,
                                    `${popMinMaxCteName}.min_date`,
                                    '>=',
                                    cfg.periodOffset,
                                    cfg.granularity,
                                    false,
                                )} AND ${getIntervalSyntax(
                                    adapterType,
                                    popField.compiledSql,
                                    `${popMinMaxCteName}.max_date`,
                                    '<=',
                                    cfg.periodOffset,
                                    cfg.granularity,
                                    false,
                                )}`,
                            ),
                        ];
                        ctes.push(
                            `${popKeysCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                                popKeysCteParts,
                            )}\n)`,
                        );

                        /**
                         * CTE to calculate PoP metrics
                         * - Include dimensions via alias
                         * - Only join keys table and metrics table
                         * - No filters needed
                         */
                        const popJoinTable = replaceUserAttributesRaw(
                            table.sqlTable,
                            intrinsicUserAttributes,
                            userAttributes,
                        );
                        const popMetricsCteName = `cte_pop_metrics_${snakeCaseName(
                            table.name,
                        ).slice(0, 16)}__${popConfigSuffix}`;
                        const popMetricsCteParts = [
                            `SELECT`,
                            [
                                ...dimensionAlias.map(
                                    (alias) => `  ${popKeysCteName}.${alias}`,
                                ),
                                ...popEntries.map((entry) => {
                                    const baseMetric = metricsInCteById.get(
                                        entry.baseMetricId,
                                    );
                                    if (!baseMetric) return undefined;
                                    return `  ${baseMetric.compiledSql} AS ${fieldQuoteChar}${entry.popMetricId}${fieldQuoteChar}`;
                                }),
                            ]
                                .filter((v) => v !== undefined)
                                .join(',\n'),
                            `FROM ${popKeysCteName}`,
                            `LEFT JOIN ${popJoinTable} AS ${fieldQuoteChar}${
                                table.name
                            }${fieldQuoteChar} ON ${primaryKey
                                .map(
                                    (pk) =>
                                        `${popKeysCteName}.${fieldQuoteChar}pk_${pk}${fieldQuoteChar} = ${fieldQuoteChar}${table.name}${fieldQuoteChar}.${pk}`,
                                )
                                .join(' AND ')}\n`,
                            dimensionAlias.length > 0
                                ? `GROUP BY ${dimensionAlias
                                      .map((val, i) => i + 1)
                                      .join(',')}`
                                : undefined,
                        ];
                        ctes.push(
                            `${popMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                                popMetricsCteParts,
                            )}\n)`,
                        );
                        popMetricCtes.push({
                            name: popMetricsCteName,
                            metrics: popEntries.map((e) => e.popMetricId),
                            popConfig: cfg,
                        });
                    });
                }
            }
        });
        if (ctes.length > 0) {
            const unaffectedMetrics = [
                ...metricsObjects,
                ...referencedMetricObjects,
            ].filter((metric) => {
                const notInMetricCtes = !metricCtes.some((metricCte) =>
                    metricCte.metrics.includes(getItemId(metric)),
                );
                const notMetricWithCteReferences =
                    !metricsWithCteReferences.find(
                        (m) => getItemId(metric) === getItemId(m),
                    );
                // Distinct metrics are handled via their own CTE
                const notSumDistinct =
                    metric.type !== MetricType.SUM_DISTINCT &&
                    metric.type !== MetricType.AVERAGE_DISTINCT;
                // Non-aggregate metrics referencing distinct metrics are
                // projected by the outer dd_base SELECT (SPK-333). Keep
                // them out of cte_unaffected so their broken compiledSql
                // (which still inlines the sum_distinct as raw SUM) isn't
                // emitted here either.
                const notNonAggReferencingDd = !nonAggReferencingDd.has(
                    getItemId(metric),
                );
                return (
                    notInMetricCtes &&
                    notMetricWithCteReferences &&
                    notSumDistinct &&
                    notNonAggReferencingDd &&
                    !nestedAggOuterIds.has(getItemId(metric))
                );
            });
            /**
             * CTE with all dimensions and metrics that aren't affected by fanouts
             * - We always need to include all dimensions
             * - Include metrics unaffected by inflation or not supported yet
             * - Include all joins
             * - Apply dimensions filters
             */
            const unaffectedMetricsCteName = `cte_unaffected`;
            const unaffectedMetricsCteParts = [
                'SELECT',
                [
                    ...Object.values(dimensionSelects),
                    ...unaffectedMetrics.map(
                        (metric) =>
                            `  ${
                                metric.compiledSql
                            } AS ${fieldQuoteChar}${getItemId(
                                metric,
                            )}${fieldQuoteChar}`,
                    ),
                ].join(',\n'),
                sqlFrom,
                ...joins,
                dimensionFilters,
                dimensionGroupBy,
            ];
            const hasUnaffectedCte: boolean =
                unaffectedMetrics.length > 0 ||
                Object.keys(dimensionSelects).length > 0;

            if (hasUnaffectedCte) {
                ctes.push(
                    `${unaffectedMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        unaffectedMetricsCteParts,
                    )}\n)`,
                );
            }
            // Create PoP CTEs for unaffected metrics
            if (hasUnaffectedCte && this.popComparisonConfigs.length > 0) {
                const unaffectedById = new Map(
                    unaffectedMetrics.map((m) => [getItemId(m), m]),
                );

                this.popComparisonConfigs.forEach((cfg) => {
                    const popEntries =
                        this.popMetricEntriesByConfigKey[cfg.configKey]?.filter(
                            (e) => unaffectedById.has(e.baseMetricId),
                        ) ?? [];

                    if (popEntries.length === 0) return;

                    const popFieldId = cfg.timeDimensionId;
                    const popConfigSuffix = cfg.cteSuffix;

                    /**
                     * CTE to get min and max date in unaffected metrics
                     */
                    const popUnaffectedMinMaxCteName = `cte_pop_unaffected_min_max_${popConfigSuffix}`;
                    const popUnaffectedMinMaxCteParts = [
                        `SELECT`,
                        [
                            `MIN(${unaffectedMetricsCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as min_date`,
                            `MAX(${unaffectedMetricsCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as max_date`,
                        ].join(',\n'),
                        `FROM ${unaffectedMetricsCteName}`,
                    ];
                    ctes.push(
                        `${popUnaffectedMinMaxCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                            popUnaffectedMinMaxCteParts,
                        )}\n)`,
                    );

                    const popField = getDimensionFromId({
                        dimId: popFieldId,
                        dimensions: this.exploreDimensions,
                        dimensionsWithoutAccess:
                            this.exploreDimensionsWithoutAccess,
                        adapterType,
                        startOfWeek,
                        timezone: this.timezoneForDateTrunc,
                        columnTimezone: this.columnTimezone,
                    });
                    const popDimensionFilters =
                        this.getPopDimensionsFilterSQL(popFieldId);

                    /**
                     * CTE for PoP unaffected metrics
                     * Reuse query filters except the comparison time dimension,
                     * which is constrained by the shifted min/max bounds.
                     */
                    const popUnaffectedMetricsCteName = `cte_pop_unaffected_${popConfigSuffix}`;
                    const popUnaffectedMetricsCteParts = [
                        'SELECT',
                        [
                            ...Object.values(dimensionSelects),
                            ...popEntries.map((entry) => {
                                const baseMetric = unaffectedById.get(
                                    entry.baseMetricId,
                                );
                                if (!baseMetric) return undefined;
                                return `  ${baseMetric.compiledSql} AS ${fieldQuoteChar}${entry.popMetricId}${fieldQuoteChar}`;
                            }),
                        ]
                            .filter((v) => v !== undefined)
                            .join(',\n'),
                        sqlFrom,
                        ...[
                            ...joins,
                            `LEFT JOIN ${popUnaffectedMinMaxCteName} ON TRUE`,
                        ],
                        MetricQueryBuilder.combineWhereClauses(
                            popDimensionFilters,
                            `WHERE ${getIntervalSyntax(
                                adapterType,
                                popField.compiledSql,
                                `${popUnaffectedMinMaxCteName}.min_date`,
                                '>=',
                                cfg.periodOffset,
                                cfg.granularity,
                                false,
                            )} AND ${getIntervalSyntax(
                                adapterType,
                                popField.compiledSql,
                                `${popUnaffectedMinMaxCteName}.max_date`,
                                '<=',
                                cfg.periodOffset,
                                cfg.granularity,
                                false,
                            )}`,
                        ),
                        dimensionGroupBy,
                    ];
                    ctes.push(
                        `${popUnaffectedMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                            popUnaffectedMetricsCteParts,
                        )}\n)`,
                    );
                    popMetricCtes.push({
                        name: popUnaffectedMetricsCteName,
                        metrics: popEntries.map((e) => e.popMetricId),
                        popConfig: cfg,
                    });
                });
            }

            const finalMetricSelects = [
                ...metricsWithCteReferences
                    .filter(
                        (metric) => !nestedAggOuterIds.has(getItemId(metric)),
                    )
                    .map((metric) => {
                        // For metrics with cross-table references, replace metric references with CTE references
                        const processedSql =
                            this.replaceMetricReferencesWithCteReferences(
                                metric,
                                [
                                    ...metricCtes,
                                    // add unaffected metrics CTE to the list, so non-inflation metrics can be referenced
                                    {
                                        name: unaffectedMetricsCteName,
                                        metrics: unaffectedMetrics.map((m) =>
                                            getItemId(m),
                                        ),
                                    },
                                ],
                            );

                        return `  ${processedSql} AS ${fieldQuoteChar}${getItemId(
                            metric,
                        )}${fieldQuoteChar}`;
                    }),
                ...metricCtes.flatMap<string>((metricCte) =>
                    metricCte.metrics
                        // excludes metrics only used for references
                        .filter((metric) =>
                            metricsObjects.find((m) => metric === getItemId(m)),
                        )
                        .map(
                            (metricName) =>
                                `  ${metricCte.name}.${fieldQuoteChar}${metricName}${fieldQuoteChar} AS ${fieldQuoteChar}${metricName}${fieldQuoteChar}`,
                        ),
                ),
                ...popMetricCtes.flatMap<string>((metricCte) =>
                    metricCte.metrics
                        // excludes metrics only used for references
                        .filter((metricId) =>
                            compiledMetricQuery.metrics.includes(metricId),
                        )
                        .map(
                            (metricName) =>
                                `  ${metricCte.name}.${fieldQuoteChar}${metricName}${fieldQuoteChar} AS ${fieldQuoteChar}${metricName}${fieldQuoteChar}`,
                        ),
                ),
            ];

            /**
             * Query to join all CTEs
             * - select all from unaffected_fields
             * - select specific metrics from metric CTEs
             * - Join metric tables:
             *   - when there are no dimensions, use CROSS JOIN
             *   - when there are dimensions, use INNER JOIN on all dimensions (+ or null) for regular metrics
             *   - PoP metric CTEs use LEFT JOIN to preserve base rows
             */
            if (hasUnaffectedCte) {
                finalSelectParts = [
                    `SELECT`,
                    [
                        `  ${unaffectedMetricsCteName}.*`,
                        ...finalMetricSelects,
                    ].join(',\n'),
                    `FROM ${unaffectedMetricsCteName}`,
                    ...metricCtes.map((metricCte) => {
                        if (Object.keys(dimensionSelects).length === 0) {
                            return `CROSS JOIN ${metricCte.name}`;
                        }
                        return `INNER JOIN ${metricCte.name} ON ${dimensionAlias
                            .map(
                                (alias) =>
                                    `( ${unaffectedMetricsCteName}.${alias} = ${metricCte.name}.${alias} OR ( ${unaffectedMetricsCteName}.${alias} IS NULL AND ${metricCte.name}.${alias} IS NULL ) )`,
                            )
                            .join(' AND ')}`;
                    }),
                    ...popMetricCtes.map((popMetricCte) => {
                        if (Object.keys(dimensionSelects).length === 0) {
                            return `CROSS JOIN ${popMetricCte.name}`;
                        }
                        const popFieldId =
                            popMetricCte.popConfig.timeDimensionId;
                        const { periodOffset, granularity } =
                            popMetricCte.popConfig;
                        return `LEFT JOIN ${
                            popMetricCte.name
                        } ON ${dimensionAlias
                            .map((alias) => {
                                if (
                                    alias ===
                                    `${fieldQuoteChar}${popFieldId}${fieldQuoteChar}`
                                ) {
                                    // join on PoP field with interval diff
                                    return `( ${getIntervalSyntax(
                                        adapterType,
                                        `${unaffectedMetricsCteName}.${alias}`,
                                        `${popMetricCte.name}.${alias}`,
                                        '=',
                                        periodOffset,
                                        granularity,
                                        true,
                                    )})`;
                                }
                                // default to joining on all dimensions
                                return `( ${unaffectedMetricsCteName}.${alias} = ${popMetricCte.name}.${alias} OR ( ${unaffectedMetricsCteName}.${alias} IS NULL AND ${popMetricCte.name}.${alias} IS NULL ) )`;
                            })
                            .join(' AND ')}`;
                    }),
                ];
            } else {
                // If there is no unaffected CTE, cross join metric CTEs
                finalSelectParts = [
                    `SELECT`,
                    finalMetricSelects.join(',\n'),
                    `FROM ${metricCtes[0].name}`,
                    ...metricCtes
                        .slice(1, metricCtes.length)
                        .map((metricCte) => `CROSS JOIN ${metricCte.name}`),
                ];
            }
        }
        return {
            ctes,
            finalSelectParts,
            warnings,
        };
    }

    static wrapAsCte(name: string, parts: Array<string | undefined>): string {
        return `${name} AS (\n${MetricQueryBuilder.assembleSqlParts(parts)}\n)`;
    }

    /**
     * Builds CTE(s) for distinct metrics (sum_distinct, average_distinct) using ROW_NUMBER deduplication.
     * Follows the same pattern as PoP CTEs: separate CTE per metric, joined on dimensions.
     */
    private buildDistinctMetricCtes({
        dimensionSelects,
        dimensionGroupBy,
        dimensionFilters,
        sqlFrom,
        joinsSql,
        dimensionJoins,
        baseCteName,
    }: {
        dimensionSelects: Record<string, string>;
        dimensionGroupBy: string | undefined;
        dimensionFilters: string | undefined;
        sqlFrom: string;
        joinsSql: string | undefined;
        dimensionJoins: string[];
        baseCteName: string;
    }): {
        ctes: string[];
        ddJoins: string[];
        ddMetricSelects: string[];
    } {
        const { warehouseSqlBuilder } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        const ddMetricIds = this.getSelectedAndReferencedMetricIds().filter(
            (id) => {
                const metric = this.getMetricFromId(id);
                return (
                    metric.type === MetricType.SUM_DISTINCT ||
                    metric.type === MetricType.AVERAGE_DISTINCT
                );
            },
        );

        const dimensionAlias = Object.keys(dimensionSelects).map(
            (alias) => `${fieldQuoteChar}${alias}${fieldQuoteChar}`,
        );

        // Recompute GROUP BY for the outer CTE using dimension count
        const ddGroupBy =
            dimensionAlias.length > 0
                ? `GROUP BY ${dimensionAlias.map((_, i) => i + 1).join(',')}`
                : undefined;

        const ctes: string[] = [];
        const ddJoins: string[] = [];
        const ddMetricSelects: string[] = [];

        // Extract raw SQL expressions from dimension selects (strip " AS alias" suffix)
        const dimensionExprs = Object.entries(dimensionSelects).map(
            ([id, selectStr]) => {
                const suffix = ` AS ${fieldQuoteChar}${id}${fieldQuoteChar}`;
                const idx = selectStr.lastIndexOf(suffix);
                return idx > -1
                    ? selectStr.substring(0, idx).trim()
                    : selectStr.trim();
            },
        );

        for (const metricId of ddMetricIds) {
            const metric = this.getMetricFromId(metricId);
            if (
                metric.compiledValueSql &&
                metric.compiledDistinctKeys?.length
            ) {
                const ddCteName = `dd_${snakeCaseName(metricId)}`;

                // Include selected dimensions in PARTITION BY so each
                // (distinct_key, dimension) combination gets its own rn=1
                const partitionExprs = [
                    ...metric.compiledDistinctKeys,
                    ...dimensionExprs,
                ];

                // Inner subquery: raw data + ROW_NUMBER
                const innerSelects = [
                    ...Object.values(dimensionSelects),
                    `  ${metric.compiledValueSql} AS __dd_val`,
                    `  ROW_NUMBER() OVER (PARTITION BY ${partitionExprs.join(', ')} ORDER BY ${metric.compiledValueSql}) AS __dd_rn`,
                ];

                const innerSubquery = MetricQueryBuilder.assembleSqlParts([
                    `SELECT\n${innerSelects.join(',\n')}`,
                    sqlFrom,
                    joinsSql,
                    ...dimensionJoins,
                    dimensionFilters,
                ]);

                // Outer CTE: aggregate with CASE WHEN on ROW_NUMBER
                let outerAgg: string;
                if (metric.type === MetricType.AVERAGE_DISTINCT) {
                    const floatType = warehouseSqlBuilder.getFloatingType();
                    outerAgg = `CAST(SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END) AS ${floatType}) / CAST(NULLIF(COUNT(CASE WHEN __dd_rn = 1 THEN __dd_val END), 0) AS ${floatType})`;
                } else {
                    outerAgg = `SUM(CASE WHEN __dd_rn = 1 THEN __dd_val ELSE NULL END)`;
                }
                const outerSelects = [
                    ...dimensionAlias,
                    `  ${outerAgg} AS ${fieldQuoteChar}${metricId}${fieldQuoteChar}`,
                ];

                const cteSql = `${ddCteName} AS (\nSELECT\n${outerSelects.join(',\n')}\nFROM (\n${innerSubquery}\n) __dd_sub\n${ddGroupBy ?? ''}\n)`;
                ctes.push(cteSql);

                // Build JOIN clause (same NULL-safe pattern as PoP)
                if (dimensionAlias.length === 0) {
                    ddJoins.push(`CROSS JOIN ${ddCteName}`);
                } else {
                    ddJoins.push(
                        `INNER JOIN ${ddCteName} ON ${dimensionAlias
                            .map(
                                (alias) =>
                                    `( ${baseCteName}.${alias} = ${ddCteName}.${alias} OR ( ${baseCteName}.${alias} IS NULL AND ${ddCteName}.${alias} IS NULL ) )`,
                            )
                            .join(' AND ')}`,
                    );
                }

                // Metric select for final query
                ddMetricSelects.push(
                    `  ${ddCteName}.${fieldQuoteChar}${metricId}${fieldQuoteChar} AS ${fieldQuoteChar}${metricId}${fieldQuoteChar}`,
                );
            }
        }

        return { ctes, ddJoins, ddMetricSelects };
    }

    /**
     * Detects metrics that have nested aggregate problems.
     * A metric has a nested aggregate problem when:
     * 1. It is a non-aggregate metric (type: number, etc.)
     * 2. Its raw SQL contains aggregation functions (sqlContainsAggregation)
     * 3. It references another metric that is an aggregate type (sum, max, count, etc.)
     */
    private getMetricsWithNestedAggregates(): Array<{
        outerMetricId: string;
        outerMetric: CompiledMetric;
        wrapsAggregation: boolean;
        innerDeps: Array<{
            fieldId: string;
            metric: CompiledMetric;
        }>;
    }> {
        if (this._nestedAggCache !== undefined) {
            return this._nestedAggCache;
        }

        // First pass: find metrics with explicit SQL aggregation wrapping aggregate refs
        // (the core nested aggregate pattern, e.g., sum(${max_metric}))
        const allMetricIds = this.getSelectedAndReferencedMetricIds();

        const findAggRefMetrics = (
            requireSqlAggregation: boolean,
        ): Array<{
            outerMetricId: string;
            outerMetric: CompiledMetric;
            wrapsAggregation: boolean;
            innerDeps: Array<{ fieldId: string; metric: CompiledMetric }>;
        }> =>
            allMetricIds.reduce<
                Array<{
                    outerMetricId: string;
                    outerMetric: CompiledMetric;
                    wrapsAggregation: boolean;
                    innerDeps: Array<{
                        fieldId: string;
                        metric: CompiledMetric;
                    }>;
                }>
            >((acc, metricId) => {
                let metric: CompiledMetric;
                try {
                    metric = this.getMetricFromId(metricId);
                } catch {
                    return acc;
                }
                if (!isNonAggregateMetric(metric)) return acc;

                const hasSqlAgg = sqlContainsAggregation(metric.sql);
                if (requireSqlAggregation && !hasSqlAgg) return acc;

                const refs = parseAllReferences(metric.sql, metric.table);
                // Collect all metric references — both aggregate (type: max/sum/etc)
                // and non-aggregate with SQL aggregation (type: number with count(...))
                // because ALL metric refs need CTE pre-computation to avoid
                // referencing the base table in the outer query context.
                const allMetricDeps: Array<{
                    fieldId: string;
                    metric: CompiledMetric;
                }> = [];
                const aggregateRefNames: string[] = [];
                const allMetricRefNames: string[] = [];
                let hasAggregateRef = false;
                for (const ref of refs) {
                    if (ref.refName !== 'TABLE') {
                        const refMetricId = getItemId({
                            table: ref.refTable,
                            name: ref.refName,
                        });
                        try {
                            const refMetric = this.getMetricFromId(refMetricId);
                            allMetricDeps.push({
                                fieldId: refMetricId,
                                metric: refMetric,
                            });
                            const refDisplayName =
                                ref.refTable === metric.table
                                    ? ref.refName
                                    : `${ref.refTable}.${ref.refName}`;
                            allMetricRefNames.push(refDisplayName);
                            if (isAggregateMetricType(refMetric.type)) {
                                hasAggregateRef = true;
                                // Track the raw reference name for position checking
                                aggregateRefNames.push(refDisplayName);
                            }
                        } catch {
                            // Not a metric reference (could be a dimension), skip
                        }
                    }
                }

                // When the SQL has aggregation AND aggregate metric refs, verify
                // that the aggregation actually WRAPS the metric refs.
                // e.g. sum(${max_value}) → true (nested aggregate)
                // e.g. sum(raw_col) / ${count_records} → false (same-level aggregates)
                if (
                    hasSqlAgg &&
                    hasAggregateRef &&
                    !sqlAggregationWrapsReferences(
                        metric.sql,
                        aggregateRefNames,
                    )
                ) {
                    hasAggregateRef = false;
                }

                // Also detect the case where SQL aggregation wraps
                // non-aggregate metric refs (e.g. MAX_BY(${number_metric},
                // ${number_metric})). These raw column refs can't appear
                // standalone in GROUP BY and need CTE routing just like
                // aggregate refs do.
                let wrapsNonAggMetricRefs = false;
                if (
                    hasSqlAgg &&
                    !hasAggregateRef &&
                    allMetricDeps.length > 0 &&
                    sqlAggregationWrapsReferences(metric.sql, allMetricRefNames)
                ) {
                    wrapsNonAggMetricRefs = true;
                }

                // Treat as nested aggregate if:
                // 1. At least one ref is an aggregate metric type, OR
                // 2. SQL aggregation wraps non-aggregate metric refs
                //    (e.g. MAX_BY(${type_number}, ${type_number}))
                const innerDeps =
                    hasAggregateRef || wrapsNonAggMetricRefs
                        ? allMetricDeps
                        : [];

                if (innerDeps.length > 0) {
                    acc.push({
                        outerMetricId: metricId,
                        outerMetric: metric,
                        wrapsAggregation: hasSqlAgg,
                        innerDeps,
                    });
                }
                return acc;
            }, []);

        // First: find metrics that truly nest aggregates (have SQL aggregation wrapping)
        const wrappingMetrics = findAggRefMetrics(true);

        // If there are wrapping metrics, also include non-wrapping metrics that
        // reference aggregates (e.g., ${max_metric} * ${count_metric}).
        // These are valid SQL alone but need CTE routing when mixed with
        // wrapping metrics to avoid GROUP BY issues in the outer query.
        let result: typeof wrappingMetrics;
        if (wrappingMetrics.length > 0) {
            const allAggRefMetrics = findAggRefMetrics(false);
            result = allAggRefMetrics;
        } else {
            result = wrappingMetrics;
        }

        this._nestedAggCache = result;
        return result;
    }

    private _nestedAggCache:
        | Array<{
              outerMetricId: string;
              outerMetric: CompiledMetric;
              wrapsAggregation: boolean;
              innerDeps: Array<{ fieldId: string; metric: CompiledMetric }>;
          }>
        | undefined = undefined;

    /**
     * Builds two CTEs for metrics that have nested aggregate dependencies.
     *
     * CTE 1 (`nested_agg`): Pre-computes inner aggregate metrics (e.g., MAX, COUNT)
     * at the dimension grain from the base table.
     *
     * CTE 2 (`nested_agg_results`): Computes the outer metric expressions
     * (e.g., sum(max_col) / count_col) by referencing CTE 1 columns. Wrapping
     * metrics can safely use aggregate functions here since refs are plain columns.
     * GROUP BY on dims + inner deps is added so aggregates are valid SQL.
     *
     * The final outer SELECT then references `nested_agg_results` columns
     * as simple column references — no aggregates, no GROUP BY needed.
     */
    private buildNestedAggregateCtes({
        dimensionSelects,
        dimensionFilters,
        sqlFrom,
        joinsSql,
        dimensionJoins,
        baseCteName,
    }: {
        dimensionSelects: Record<string, string>;
        dimensionFilters: string | undefined;
        sqlFrom: string;
        joinsSql: string | undefined;
        dimensionJoins: string[];
        baseCteName: string;
    }): {
        ctes: string[];
        naJoins: string[];
        naMetricSelects: string[];
        outerMetricIds: string[];
    } {
        const { warehouseSqlBuilder } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        const nestedAggMetrics = this.getMetricsWithNestedAggregates();
        if (nestedAggMetrics.length === 0) {
            return {
                ctes: [],
                naJoins: [],
                naMetricSelects: [],
                outerMetricIds: [],
            };
        }

        // Collect all unique inner dependencies, excluding deps that are
        // themselves outer metrics (they'll be computed in CTE 2, not CTE 1).
        // This handles transitive nesting where an intermediate metric is both
        // an inner dep of one metric and an outer metric that wraps another.
        const outerMetricIds = new Set(
            nestedAggMetrics.map(({ outerMetricId }) => outerMetricId),
        );
        const allInnerDeps = new Map<string, CompiledMetric>();
        for (const { innerDeps } of nestedAggMetrics) {
            for (const dep of innerDeps) {
                if (
                    !allInnerDeps.has(dep.fieldId) &&
                    !outerMetricIds.has(dep.fieldId)
                ) {
                    allInnerDeps.set(dep.fieldId, dep.metric);
                }
            }
        }

        // Partition inner deps into aggregate (can be pre-computed with
        // GROUP BY) and raw/non-aggregate (plain column references that
        // cannot appear in a SELECT with GROUP BY without aggregation).
        const aggregateInnerDeps = new Map<string, CompiledMetric>();
        const rawInnerDeps = new Map<string, CompiledMetric>();
        for (const [depId, depMetric] of allInnerDeps) {
            if (
                isAggregateMetricType(depMetric.type) ||
                sqlContainsAggregation(depMetric.compiledSql)
            ) {
                aggregateInnerDeps.set(depId, depMetric);
            } else {
                rawInnerDeps.set(depId, depMetric);
            }
        }

        const dimensionAlias = Object.keys(dimensionSelects).map(
            (alias) => `${fieldQuoteChar}${alias}${fieldQuoteChar}`,
        );

        const aggInnerDepAliases = Array.from(aggregateInnerDeps.keys()).map(
            (depId) => `${fieldQuoteChar}${depId}${fieldQuoteChar}`,
        );

        // --- CTE 1: nested_agg — pre-compute AGGREGATE inner deps only ---
        // Raw (non-aggregate) inner deps are excluded because they can't
        // appear in a SELECT with GROUP BY. They'll be accessed from the
        // base table in CTE 3 (nested_agg_mixed) instead.
        const naCteName = 'nested_agg';
        const innerMetricSelects = Array.from(aggregateInnerDeps.entries()).map(
            ([depId, depMetric]) =>
                `  ${depMetric.compiledSql} AS ${fieldQuoteChar}${depId}${fieldQuoteChar}`,
        );

        const naGroupBy =
            dimensionAlias.length > 0
                ? `GROUP BY ${dimensionAlias.map((_, i) => i + 1).join(',')}`
                : undefined;

        const cte1Sql = MetricQueryBuilder.wrapAsCte(naCteName, [
            `SELECT\n${[...Object.values(dimensionSelects), ...innerMetricSelects].join(',\n')}`,
            sqlFrom,
            joinsSql,
            ...dimensionJoins,
            dimensionFilters,
            naGroupBy,
        ]);

        // --- CTE 2: nested_agg_results — compute outer metrics from CTE 1 ---
        const naResultsCteName = 'nested_agg_results';
        const metricCteLookup: Array<{ name: string; metrics: string[] }> = [
            {
                name: naCteName,
                metrics: Array.from(aggregateInnerDeps.keys()),
            },
        ];

        // Topological sort: metrics that reference other outer metrics must
        // come after their dependencies. This allows transitive nesting
        // (e.g. ratio → sum_case → max) to be resolved correctly by inlining
        // the already-processed SQL of dependencies.
        const outerMetricRefMap = new Map<string, Set<string>>();
        for (const { outerMetricId, outerMetric } of nestedAggMetrics) {
            const refs = parseAllReferences(outerMetric.sql, outerMetric.table);
            const outerRefs = new Set<string>();
            for (const ref of refs) {
                if (ref.refName !== 'TABLE') {
                    const refId = getItemId({
                        table: ref.refTable,
                        name: ref.refName,
                    });
                    if (outerMetricIds.has(refId)) {
                        outerRefs.add(refId);
                    }
                }
            }
            outerMetricRefMap.set(outerMetricId, outerRefs);
        }

        const sortedOuterMetrics: typeof nestedAggMetrics = [];
        const visited = new Set<string>();
        const visit = (metricId: string): void => {
            if (visited.has(metricId)) return;
            visited.add(metricId);
            const deps = outerMetricRefMap.get(metricId);
            if (deps) {
                for (const depId of deps) {
                    visit(depId);
                }
            }
            const metric = nestedAggMetrics.find(
                (m) => m.outerMetricId === metricId,
            );
            if (metric) {
                sortedOuterMetrics.push(metric);
            }
        };
        for (const { outerMetricId } of nestedAggMetrics) {
            visit(outerMetricId);
        }

        // Track processed SQL for outer metrics so that metrics referencing
        // other outer metrics can inline their already-processed expressions.
        const processedOuterMetricSql = new Map<string, string>();

        // Partition outer metrics: "pure aggregate" (all inner deps are
        // aggregate — handled in CTE 2 from CTE 1) vs "mixed" (has at least
        // one raw/non-aggregate inner dep — needs base table access in CTE 3).
        const pureAggResultsSelects: string[] = [];
        const mixedResultsSelects: string[] = [];
        const pureAggOuterMetricIds: string[] = [];
        const mixedOuterMetricIds: string[] = [];

        for (const { outerMetricId, outerMetric } of sortedOuterMetrics) {
            // Build a metric with ${} refs to other outer metrics pre-replaced
            // with their already-processed CTE SQL expressions
            let preSql = outerMetric.sql;
            for (const [depId, depSql] of processedOuterMetricSql) {
                const depMetric = this.getMetricFromId(depId);
                const escapedName = depMetric.name.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&',
                );
                // Replace both short form ${name} and qualified form ${table.name}
                const escapedTable = depMetric.table.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&',
                );
                preSql = preSql
                    .replace(
                        new RegExp(`\\$\\{${escapedName}\\}`, 'g'),
                        `(${depSql})`,
                    )
                    .replace(
                        new RegExp(
                            `\\$\\{${escapedTable}\\.${escapedName}\\}`,
                            'g',
                        ),
                        `(${depSql})`,
                    );
            }

            // Check if this outer metric has any raw (non-aggregate) inner deps
            const metricEntry = nestedAggMetrics.find(
                (m) => m.outerMetricId === outerMetricId,
            );
            const hasRawDep =
                metricEntry?.innerDeps.some((dep) =>
                    rawInnerDeps.has(dep.fieldId),
                ) ?? false;

            if (hasRawDep) {
                // Mixed metric: replace aggregate dep refs with CTE 1 column
                // refs, then let compileMetricSql resolve raw refs and
                // ${TABLE} refs against the base table (which is in scope in
                // CTE 3). Resolve each ${ref} via getParsedReference so the
                // short form ${name} maps to the outer metric's own table —
                // not to a same-named metric on a joined table (PROD-7503).
                const mixedSql = preSql.replace(
                    lightdashVariablePattern,
                    (fullMatch, ref) => {
                        if (ref === 'TABLE') return fullMatch;
                        const { refTable, refName } = getParsedReference(
                            ref,
                            outerMetric.table,
                        );
                        const refItemId = getItemId({
                            table: refTable,
                            name: refName,
                        });
                        if (aggregateInnerDeps.has(refItemId)) {
                            return `${naCteName}.${fieldQuoteChar}${refItemId}${fieldQuoteChar}`;
                        }
                        return fullMatch;
                    },
                );

                // Compile remaining refs (raw metric refs, ${TABLE}, dimensions)
                // against the explore tables — they resolve to base table columns.
                const { explore, warehouseSqlBuilder: wsb } = this.args;
                const exploreCompiler = new ExploreCompiler(wsb);
                const compiled = exploreCompiler.compileMetricSql(
                    { ...outerMetric, sql: mixedSql },
                    explore.tables,
                    Object.keys(this.args.parameterDefinitions),
                );

                processedOuterMetricSql.set(outerMetricId, compiled.sql);
                mixedResultsSelects.push(
                    `  ${compiled.sql} AS ${fieldQuoteChar}${outerMetricId}${fieldQuoteChar}`,
                );
                mixedOuterMetricIds.push(outerMetricId);
            } else {
                // Pure aggregate metric: all deps are in CTE 1 — use existing
                // CTE column ref replacement.
                const metricWithPreSql = { ...outerMetric, sql: preSql };
                const processedSql =
                    this.replaceMetricReferencesWithCteReferences(
                        metricWithPreSql,
                        metricCteLookup,
                    );

                processedOuterMetricSql.set(outerMetricId, processedSql);
                pureAggResultsSelects.push(
                    `  ${processedSql} AS ${fieldQuoteChar}${outerMetricId}${fieldQuoteChar}`,
                );
                pureAggOuterMetricIds.push(outerMetricId);
            }
        }

        const ctes: string[] = [cte1Sql];
        const naJoins: string[] = [];
        const naMetricSelects: string[] = [];

        // --- CTE 2: nested_agg_results — pure aggregate outer metrics ---
        // These read FROM CTE 1 only (one row per dim group).
        if (pureAggResultsSelects.length > 0) {
            // GROUP BY dims + aggregate inner deps so aggregate functions are valid
            // Since CTE 1 has one row per dim group, this is effectively identity
            const allGroupByCols = [
                ...dimensionAlias.map((a) => `${naCteName}.${a}`),
                ...aggInnerDepAliases.map((a) => `${naCteName}.${a}`),
            ];
            const resultsGroupBy =
                allGroupByCols.length > 0
                    ? `GROUP BY ${allGroupByCols.join(', ')}`
                    : undefined;

            const resultsDimSelects = dimensionAlias.map(
                (a) => `  ${naCteName}.${a}`,
            );
            const cte2Sql = MetricQueryBuilder.wrapAsCte(naResultsCteName, [
                `SELECT\n${[...resultsDimSelects, ...pureAggResultsSelects].join(',\n')}`,
                `FROM ${naCteName}`,
                resultsGroupBy,
            ]);
            ctes.push(cte2Sql);

            if (dimensionAlias.length === 0) {
                naJoins.push(`CROSS JOIN ${naResultsCteName}`);
            } else {
                naJoins.push(
                    `INNER JOIN ${naResultsCteName} ON ${dimensionAlias
                        .map(
                            (alias) =>
                                `( ${baseCteName}.${alias} = ${naResultsCteName}.${alias} OR ( ${baseCteName}.${alias} IS NULL AND ${naResultsCteName}.${alias} IS NULL ) )`,
                        )
                        .join(' AND ')}`,
                );
            }

            for (const id of pureAggOuterMetricIds) {
                naMetricSelects.push(
                    `  ${naResultsCteName}.${fieldQuoteChar}${id}${fieldQuoteChar}`,
                );
            }
        }

        // --- CTE 3: nested_agg_mixed — outer metrics with raw inner deps ---
        // These need per-row access to the base table for raw column refs,
        // JOINed with CTE 1 for pre-computed aggregate deps.
        if (mixedResultsSelects.length > 0) {
            const naMixedCteName = 'nested_agg_mixed';

            // JOIN CTE 1 to the base table on dimensions.
            // dimensionSelects values look like:
            //   '  "table".col AS "alias"'
            // Extract the expression before AS for join conditions.
            const cteJoinConditions = Object.entries(dimensionSelects).map(
                ([id]) => {
                    const qId = `${fieldQuoteChar}${id}${fieldQuoteChar}`;
                    const expr = dimensionSelects[id]
                        .trim()
                        .replace(/\s+AS\s+.*$/i, '')
                        .trim();
                    return `( ${expr} = ${naCteName}.${qId} OR ( ${expr} IS NULL AND ${naCteName}.${qId} IS NULL ) )`;
                },
            );
            const cteJoinClause =
                dimensionAlias.length > 0
                    ? `INNER JOIN ${naCteName} ON ${cteJoinConditions.join(' AND ')}`
                    : `CROSS JOIN ${naCteName}`;

            const mixedDimSelects = Object.entries(dimensionSelects).map(
                ([, selectExpr]) => selectExpr,
            );

            const mixedGroupBy =
                mixedDimSelects.length > 0
                    ? `GROUP BY ${mixedDimSelects.map((_, i) => i + 1).join(',')}`
                    : undefined;

            const cte3Sql = MetricQueryBuilder.wrapAsCte(naMixedCteName, [
                `SELECT\n${[...mixedDimSelects, ...mixedResultsSelects].join(',\n')}`,
                sqlFrom,
                joinsSql,
                ...dimensionJoins,
                cteJoinClause,
                dimensionFilters,
                mixedGroupBy,
            ]);
            ctes.push(cte3Sql);

            if (dimensionAlias.length === 0) {
                naJoins.push(`CROSS JOIN ${naMixedCteName}`);
            } else {
                naJoins.push(
                    `INNER JOIN ${naMixedCteName} ON ${dimensionAlias
                        .map(
                            (alias) =>
                                `( ${baseCteName}.${alias} = ${naMixedCteName}.${alias} OR ( ${baseCteName}.${alias} IS NULL AND ${naMixedCteName}.${alias} IS NULL ) )`,
                        )
                        .join(' AND ')}`,
                );
            }

            for (const id of mixedOuterMetricIds) {
                naMetricSelects.push(
                    `  ${naMixedCteName}.${fieldQuoteChar}${id}${fieldQuoteChar}`,
                );
            }
        }

        return {
            ctes,
            naJoins,
            naMetricSelects,
            outerMetricIds: [...pureAggOuterMetricIds, ...mixedOuterMetricIds],
        };
    }

    // Build the optional metric_filters CTE; return next cte name + cte text (if created)
    static buildMetricFiltersCte(
        currentName: string,
        metricsFiltersSQL: string,
    ): { cte: string; cteName: string } {
        const cteName = 'metric_filters';
        const parts = [
            'SELECT',
            '  *',
            `FROM ${currentName}`,
            metricsFiltersSQL,
        ];
        return { cte: MetricQueryBuilder.wrapAsCte(cteName, parts), cteName };
    }

    static buildSimpleCalcsCte(
        currentName: string,
        simpleSelects: string[],
        hasDependendTableCalcs: boolean = false,
        metricFiltersSQL?: string,
    ): { cteName: string; cte?: string } {
        const cteName = 'table_calculations';
        const parts = [
            'SELECT',
            ['  *', ...simpleSelects].join(',\n'),
            `FROM ${currentName}`,
            // Include metric filters in this CTE when there are table calc filters but no dependent table calcs
            !hasDependendTableCalcs && metricFiltersSQL
                ? metricFiltersSQL
                : undefined,
        ];
        return { cteName, cte: MetricQueryBuilder.wrapAsCte(cteName, parts) };
    }

    private getPartitionedTableCalculations(): {
        simpleTableCalcs: CompiledTableCalculation[];
        interdependentTableCalcs: CompiledTableCalculation[];
    } {
        const { compiledTableCalculations } = this.args.compiledMetricQuery;

        const tableCalcsNeedingCtes = new Set<string>();

        // Add all dependent table calculations
        for (const tc of compiledTableCalculations) {
            if (tc.dependsOn && tc.dependsOn.length > 0) {
                tableCalcsNeedingCtes.add(tc.name);
                // Also add any table calculations this depends on
                tc.dependsOn.forEach((dep) => {
                    if (compiledTableCalculations.some((t) => t.name === dep)) {
                        tableCalcsNeedingCtes.add(dep);
                    }
                });
            }
        }

        return compiledTableCalculations.reduce<{
            simpleTableCalcs: CompiledTableCalculation[];
            interdependentTableCalcs: CompiledTableCalculation[];
        }>(
            (acc, tc) => {
                if (tableCalcsNeedingCtes.has(tc.name)) {
                    acc.interdependentTableCalcs.push(tc);
                } else {
                    acc.simpleTableCalcs.push(tc);
                }
                return acc;
            },
            { simpleTableCalcs: [], interdependentTableCalcs: [] },
        );
    }

    // Sort table calculations by their dependencies to ensure correct CTE order
    private sortTableCalcsByDependencies(
        tableCalcs: typeof this.args.compiledMetricQuery.compiledTableCalculations,
    ) {
        const sorted: typeof tableCalcs = [];
        const remaining = [...tableCalcs];

        while (remaining.length > 0) {
            const canProcess = remaining.filter(
                (tc) =>
                    !tc.dependsOn ||
                    tc.dependsOn.every(
                        (dep) =>
                            sorted.some((s) => s.name === dep) ||
                            !tableCalcs.some((t) => t.name === dep),
                    ), // dep is not a table calc (already handled)
            );

            if (canProcess.length === 0) {
                // This shouldn't happen if we've properly detected circular dependencies
                throw new CompileError(
                    `Circular dependency detected in table calculation`,
                );
            }

            canProcess.forEach((tc) => {
                sorted.push(tc);
                const index = remaining.indexOf(tc);
                remaining.splice(index, 1);
            });
        }

        return sorted;
    }

    // Find which CTE contains the referenced table calculation
    private findContainingCte(
        refName: string,
        currentTcName: string,
        allTableCalcs: CompiledTableCalculation[],
        currentCteName: string,
    ): string {
        const { interdependentTableCalcs } =
            this.getPartitionedTableCalculations();

        // Check if the referenced table calc needs its own CTE
        const referencedTc = interdependentTableCalcs.find(
            (tc) => tc.name === refName,
        );

        if (referencedTc) {
            // The referenced table calc has its own CTE
            // Find the most recent CTE that contains this table calculation
            const sortedTableCalcs = this.sortTableCalcsByDependencies(
                interdependentTableCalcs,
            );
            const currentIndex = sortedTableCalcs.findIndex(
                (tc) => tc.name === currentTcName,
            );
            const referencedIndex = sortedTableCalcs.findIndex(
                (tc) => tc.name === refName,
            );

            // If the referenced table calc comes before the current one in the chain,
            // find the most recent CTE before current that contains it
            if (referencedIndex < currentIndex && currentIndex >= 0) {
                // The most recent CTE that contains the referenced table calc is the one right before current
                // because each CTE does SELECT * from the previous one
                const mostRecentIndex = currentIndex - 1;
                if (mostRecentIndex >= 0) {
                    return `tc_${sortedTableCalcs[mostRecentIndex].name}`;
                }
                // If no previous CTE, it should be in table_calculations
                return 'table_calculations';
            }

            return `tc_${refName}`;
        }

        // Otherwise, it's a simple table calc in the shared table_calculations CTE
        // Find the most recent CTE before current that would contain it
        if (currentCteName.startsWith('tc_')) {
            const sortedTableCalcs = this.sortTableCalcsByDependencies(
                interdependentTableCalcs,
            );
            const currentIndex = sortedTableCalcs.findIndex(
                (tc) => tc.name === currentTcName,
            );

            if (currentIndex > 0) {
                // It should be available from the previous CTE
                return `tc_${sortedTableCalcs[currentIndex - 1].name}`;
            }
            return 'table_calculations';
        }
        return currentCteName;
    }

    // Build dependent table calculation CTEs in the correct order with proper FROM clauses
    private buildDependentTableCalcCtes(
        currentName: string,
        interdependentTableCalcs: CompiledTableCalculation[],
    ) {
        const { warehouseSqlBuilder } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const orderByClause = this.buildWindowOrderByClause();

        // Sort table calculations in dependency order
        const sortedTableCalcs = this.sortTableCalcsByDependencies(
            interdependentTableCalcs,
        );
        const ctes: string[] = [];
        let lastCteName = currentName;

        for (const tc of sortedTableCalcs) {
            const cteName = `tc_${tc.name}`;

            // Replace total()/row_total() refs with column aliases before function parsing
            let compiledSql: string | null = this.replaceTotalReferences(
                tc.compiledSql,
            );
            const functions = parseTableCalculationFunctions(compiledSql);
            if (hasPivotFunctions(functions)) {
                compiledSql = null;
            } else if (hasRowFunctions(functions)) {
                const compiler = new TableCalculationFunctionCompiler(
                    warehouseSqlBuilder,
                );
                compiledSql = compiler.compileFunctions(
                    compiledSql,
                    functions,
                    orderByClause,
                );
            }

            const parts = [
                'SELECT',
                [
                    '  *',
                    `  ${compiledSql} AS ${fieldQuoteChar}${tc.name}${fieldQuoteChar}`,
                ].join(',\n'),
                `FROM ${lastCteName}`,
            ];

            ctes.push(MetricQueryBuilder.wrapAsCte(cteName, parts));
            lastCteName = cteName;
        }

        return { ctes, lastCteName };
    }

    // Create PostCalculation metric CTEs
    private createPostCalculationMetricCtes(currentCteName: string): {
        ctes: string[];
        finalCteName: string;
    } {
        const { warehouseSqlBuilder, pivotConfiguration } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const postCalculationMetrics = this.getPostCalculationMetrics();
        const referencedMetricIds = this.getSelectedAndReferencedMetricIds();
        const { sqlOrderBy } = this.getSortSQL(true);

        if (postCalculationMetrics.length === 0) {
            return { ctes: [], finalCteName: currentCteName };
        }

        const cteName = 'postcalculation_metrics';

        // Create metric CTE references for the referenced metrics
        // Referenced metrics should be available in the current CTE
        const metricCtes = [
            {
                name: currentCteName,
                metrics: referencedMetricIds,
            },
        ];

        // Create a single CTE with all PostCalculation metrics
        const metricSelects = postCalculationMetrics.map((metricId) => {
            const metric = this.getMetricFromId(metricId);
            // Use replaceMetricReferencesWithCteReferences to properly resolve metric references
            const processedSql = this.replaceMetricReferencesWithCteReferences(
                metric,
                metricCtes,
            );
            const compiledSql = compilePostCalculationMetric({
                warehouseSqlBuilder,
                type: metric.type,
                pivotConfiguration,
                sql: processedSql,
                orderByClause: sqlOrderBy,
            });
            return `  ${compiledSql} AS ${fieldQuoteChar}${metricId}${fieldQuoteChar}`;
        });

        const parts = [
            'SELECT',
            ['  *', ...metricSelects].join(',\n'),
            `FROM ${currentCteName}`,
        ];

        const cte = MetricQueryBuilder.wrapAsCte(cteName, parts);

        return { ctes: [cte], finalCteName: cteName };
    }

    private getNonPivotDimensionIds(): string[] {
        // First try: use PivotConfiguration.indexColumn (available when SQL pivot is enabled)
        const pivot = this.args.pivotConfiguration;
        if (pivot?.indexColumn) {
            const indexColumns = Array.isArray(pivot.indexColumn)
                ? pivot.indexColumn
                : [pivot.indexColumn];
            return indexColumns.map((col) => col.reference);
        }
        // Fallback: derive from pivotDimensions (lightweight — just the list of pivoted dimension IDs)
        const { pivotDimensions } = this.args;
        if (pivotDimensions && pivotDimensions.length > 0) {
            const allDimensions =
                this.args.compiledMetricQuery.dimensions || [];
            return allDimensions.filter(
                (dim) => !pivotDimensions.includes(dim),
            );
        }
        return [];
    }

    private replaceTotalReferences(compiledSql: string): string {
        const q = this.args.warehouseSqlBuilder.getFieldQuoteChar();
        const { totalRegex, rowTotalRegex } = buildTotalFieldRegex(q);

        let result = compiledSql;
        // Replace row_total first to avoid partial match
        // When no pivot info, row_total(field) = field (only one column, so row total is the value itself)
        const hasPivot =
            !!this.args.pivotConfiguration ||
            (this.args.pivotDimensions && this.args.pivotDimensions.length > 0);
        result = result.replace(
            rowTotalRegex,
            hasPivot ? `${q}$1__row_total${q}` : `${q}$1${q}`,
        );
        result = result.replace(totalRegex, `${q}$1__total${q}`);
        return result;
    }

    private buildTotalsCtes(opts: {
        totalFields: string[];
        rowTotalFields: string[];
        currentCteName: string;
        sqlFrom: string;
        joinsSql: string | undefined;
        dimensionJoins: string[];
        dimensionFilters: string | undefined;
        dimensionSelects: Record<string, string>;
    }): { ctes: string[]; finalCteName: string } {
        const fieldQuoteChar =
            this.args.warehouseSqlBuilder.getFieldQuoteChar();
        const ctes: string[] = [];

        // column_totals CTE: grand total with no GROUP BY
        if (opts.totalFields.length > 0) {
            const totalSelects = opts.totalFields.map((fieldId) => {
                const metric = this.getMetricFromId(fieldId);
                return `  ${metric.compiledSql} AS ${fieldQuoteChar}${fieldId}__total${fieldQuoteChar}`;
            });
            ctes.push(
                MetricQueryBuilder.wrapAsCte('column_totals', [
                    `SELECT\n${totalSelects.join(',\n')}`,
                    opts.sqlFrom,
                    opts.joinsSql,
                    ...opts.dimensionJoins,
                    opts.dimensionFilters,
                ]),
            );
        }

        // row_totals CTE: SUM of metric values grouped by non-pivot dimensions
        // Per spec, row totals are always a SUM of the numeric values in each row,
        // so we read from the already-grouped results (currentCteName) rather than
        // re-aggregating from raw data like column_totals does.
        const hasPivotInfo =
            !!this.args.pivotConfiguration ||
            (this.args.pivotDimensions && this.args.pivotDimensions.length > 0);
        if (opts.rowTotalFields.length > 0 && hasPivotInfo) {
            const nonPivotDimIds = this.getNonPivotDimensionIds();
            const dimSelects = nonPivotDimIds
                .filter((dimId) => dimId in opts.dimensionSelects)
                .map((dimId) => `  ${fieldQuoteChar}${dimId}${fieldQuoteChar}`);
            const rowTotalSelects = opts.rowTotalFields.map(
                (fieldId) =>
                    `  SUM(${fieldQuoteChar}${fieldId}${fieldQuoteChar}) AS ${fieldQuoteChar}${fieldId}__row_total${fieldQuoteChar}`,
            );
            const groupByIndices =
                dimSelects.length > 0
                    ? `GROUP BY ${dimSelects.map((_, i) => i + 1).join(', ')}`
                    : undefined;
            ctes.push(
                MetricQueryBuilder.wrapAsCte('row_totals', [
                    `SELECT\n${[...dimSelects, ...rowTotalSelects].join(',\n')}`,
                    `FROM ${opts.currentCteName}`,
                    groupByIndices,
                ]),
            );
        }

        // with_totals CTE: joins column_totals and row_totals into the pipeline
        const totalSelectColumns: string[] = [];
        const joinClauses: string[] = [];

        if (opts.totalFields.length > 0) {
            totalSelectColumns.push(
                ...opts.totalFields.map(
                    (fieldId) =>
                        `  column_totals.${fieldQuoteChar}${fieldId}__total${fieldQuoteChar}`,
                ),
            );
            joinClauses.push('CROSS JOIN column_totals');
        }

        if (opts.rowTotalFields.length > 0 && hasPivotInfo) {
            const nonPivotDimIds = this.getNonPivotDimensionIds().filter(
                (dimId) => dimId in opts.dimensionSelects,
            );
            totalSelectColumns.push(
                ...opts.rowTotalFields.map(
                    (fieldId) =>
                        `  row_totals.${fieldQuoteChar}${fieldId}__row_total${fieldQuoteChar}`,
                ),
            );
            if (nonPivotDimIds.length > 0) {
                const joinCondition = nonPivotDimIds
                    .map(
                        (dimId) =>
                            `(${opts.currentCteName}.${fieldQuoteChar}${dimId}${fieldQuoteChar} = row_totals.${fieldQuoteChar}${dimId}${fieldQuoteChar} OR (${opts.currentCteName}.${fieldQuoteChar}${dimId}${fieldQuoteChar} IS NULL AND row_totals.${fieldQuoteChar}${dimId}${fieldQuoteChar} IS NULL))`,
                    )
                    .join(' AND ');
                joinClauses.push(`LEFT JOIN row_totals ON ${joinCondition}`);
            } else {
                joinClauses.push('CROSS JOIN row_totals');
            }
        }

        ctes.push(
            MetricQueryBuilder.wrapAsCte('with_totals', [
                `SELECT\n${[`  ${opts.currentCteName}.*`, ...totalSelectColumns].join(',\n')}`,
                `FROM ${opts.currentCteName}`,
                ...joinClauses,
            ]),
        );

        return { ctes, finalCteName: 'with_totals' };
    }

    // Create table calculation CTEs (excluding metric filters)
    private createTableCalculationCtes(
        currentCteName: string,
        simpleTableCalcs: CompiledTableCalculation[],
        interdependentTableCalcs: CompiledTableCalculation[],
        simpleTableCalculationSelects: string[],
        tableCalculationFilters: string | undefined,
        metricsFiltersSQL: string | undefined,
    ): {
        ctes: string[];
        finalCteName: string;
        createdSimpleTableCalcsCte: boolean;
    } {
        const ctesToAdd: string[] = [];
        let currentName = currentCteName;

        const needsSimpleTableCalcsCte =
            (simpleTableCalcs.length > 0 && !!tableCalculationFilters) ||
            (simpleTableCalcs.length > 0 &&
                interdependentTableCalcs.length > 0);

        const needsDependentTableCalcsCte = interdependentTableCalcs.length > 0;

        let createdSimpleTableCalcsCte = false;

        // Create simple table_calculations CTE if needed
        if (needsSimpleTableCalcsCte) {
            const {
                cte: simpleTableCalcSelects,
                cteName: simpleTableCalcSelectsCteName,
            } = MetricQueryBuilder.buildSimpleCalcsCte(
                currentName,
                simpleTableCalculationSelects,
                interdependentTableCalcs.length > 0,
                metricsFiltersSQL, // Pass metric filters to include when needed
            );
            if (simpleTableCalcSelects) {
                ctesToAdd.push(simpleTableCalcSelects);
                currentName = simpleTableCalcSelectsCteName;
                createdSimpleTableCalcsCte = true;
            }
        }

        // Create dependent table calc CTEs if needed
        if (needsDependentTableCalcsCte) {
            const { ctes: dependentCtes, lastCteName: dependentCteName } =
                this.buildDependentTableCalcCtes(
                    currentName,
                    interdependentTableCalcs,
                );
            if (dependentCtes.length) ctesToAdd.push(...dependentCtes);
            currentName = dependentCteName;
        }

        return {
            ctes: ctesToAdd,
            finalCteName: currentName,
            createdSimpleTableCalcsCte,
        };
    }

    /**
     * Compiles a database query based on the provided metric query, explores, user attributes, and warehouse-specific configurations.
     *
     * This method processes dimensions, metrics, filters, and joins across multiple dataset definitions to generate
     * a complete SQL query string tailored for the specific warehouse type and environment. Additionally, it ensures
     * field validation and substitution of user-specific attributes for dynamic query generation.
     *
     * @return {CompiledQuery} The compiled query object containing the SQL string and meta information ready for execution.
     */
    /**
     * Build a fields context for Liquid SQL introspection.
     * Produces a nested { tableName: { fieldName: { inQuery, isFiltered } } }
     * structure that lets Liquid templates check whether a field is selected or filtered.
     */
    private buildFieldsContext(): FieldsContext {
        const { explore, compiledMetricQuery } = this.args;
        const { dimensions, metrics, filters } = compiledMetricQuery;

        const selectedFieldIds = new Set<string>([...dimensions, ...metrics]);

        const filteredFieldIds = new Set<string>();
        for (const rule of getFilterRulesFromGroup(filters.dimensions)) {
            if ('fieldId' in rule.target) {
                filteredFieldIds.add(rule.target.fieldId);
            }
        }
        for (const rule of getFilterRulesFromGroup(filters.metrics)) {
            if ('fieldId' in rule.target) {
                filteredFieldIds.add(rule.target.fieldId);
            }
        }

        const fieldsContext: FieldsContext = {};

        for (const [tableName, table] of Object.entries(explore.tables)) {
            const tableFields: Record<
                string,
                { inQuery: boolean; isFiltered: boolean }
            > = {};

            for (const dim of Object.values(table.dimensions)) {
                const fieldId = getItemId(dim);
                tableFields[dim.name] = {
                    inQuery: selectedFieldIds.has(fieldId),
                    isFiltered: filteredFieldIds.has(fieldId),
                };
            }

            for (const metric of Object.values(table.metrics)) {
                const fieldId = getItemId(metric);
                tableFields[metric.name] = {
                    inQuery: selectedFieldIds.has(fieldId),
                    isFiltered: filteredFieldIds.has(fieldId),
                };
            }

            if (Object.keys(tableFields).length > 0) {
                fieldsContext[tableName] = tableFields;
            }
        }

        return fieldsContext;
    }

    public compileQuery(): CompiledQuery {
        const { explore, compiledMetricQuery } = this.args;
        const fields = getFieldsFromMetricQuery(compiledMetricQuery, explore);

        const dimensionsSQL = this.getDimensionsSQL();
        const metricsSQL = this.getMetricsSQL();

        const joins = this.getJoinsSQL({
            tablesReferencedInDimensions: dimensionsSQL.tables,
            tablesReferencedInMetrics: metricsSQL.tables,
        });
        const sqlSelect = `SELECT\n${[
            ...Object.values(dimensionsSQL.selects),
            ...metricsSQL.selects,
        ].join(',\n')}`;
        const sqlFrom = this.getBaseTableFromSQL();
        const sqlLimit = this.getLimitSQL();
        const { sqlOrderBy, requiresQueryInCTE: initialRequiresQueryInCTE } =
            this.getSortSQL();
        let requiresQueryInCTE = initialRequiresQueryInCTE;
        const ctes = [...dimensionsSQL.ctes];
        let finalSelectParts: Array<string | undefined> = [
            sqlSelect,
            sqlFrom,
            joins.joinSQL,
            ...dimensionsSQL.joins,
            dimensionsSQL.filtersSQL,
            dimensionsSQL.groupBySQL,
        ];

        const warnings: QueryWarning[] = [];
        const experimentalMetricsCteSQL = this.getExperimentalMetricsCteSQL({
            joinedTables: joins.tables,
            dimensionSelects: dimensionsSQL.selects,
            dimensionFilters: dimensionsSQL.filtersSQL,
            dimensionGroupBy: dimensionsSQL.groupBySQL,
            sqlFrom,
            joins: [joins.joinSQL, ...dimensionsSQL.joins],
        });
        if (experimentalMetricsCteSQL.finalSelectParts) {
            finalSelectParts = experimentalMetricsCteSQL.finalSelectParts;
            ctes.push(...experimentalMetricsCteSQL.ctes);
        } else if (this.popComparisonConfigs.length > 0) {
            // Support multiple PoP configs (e.g. Previous month + 2 months ago) in the same query
            const fieldQuoteChar =
                this.args.warehouseSqlBuilder.getFieldQuoteChar();
            const adapterType: SupportedDbtAdapter =
                this.args.warehouseSqlBuilder.getAdapterType();
            const startOfWeek = this.args.warehouseSqlBuilder.getStartOfWeek();

            const baseCteName = 'base_metrics';
            ctes.push(
                MetricQueryBuilder.wrapAsCte(baseCteName, finalSelectParts),
            );

            const dimensionAlias = Object.keys(dimensionsSQL.selects).map(
                (alias) => `${fieldQuoteChar}${alias}${fieldQuoteChar}`,
            );

            const popJoins: string[] = [];
            const popMetricSelects: string[] = [];

            this.popComparisonConfigs.forEach((cfg) => {
                const popEntries =
                    this.popMetricEntriesByConfigKey[cfg.configKey] ?? [];
                if (popEntries.length === 0) return;

                const popConfigSuffix = cfg.cteSuffix;
                const popFieldId = cfg.timeDimensionId;

                const popMinMaxCteName = `pop_min_max_${popConfigSuffix}`;
                const popMinMaxCteParts = [
                    `SELECT`,
                    [
                        `MIN(${baseCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as min_date`,
                        `MAX(${baseCteName}.${fieldQuoteChar}${popFieldId}${fieldQuoteChar}) as max_date`,
                    ].join(',\n'),
                    `FROM ${baseCteName}`,
                ];
                ctes.push(
                    `${popMinMaxCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        popMinMaxCteParts,
                    )}\n)`,
                );

                const popCteName = `pop_metrics_${popConfigSuffix}`;
                const popField = getDimensionFromId({
                    dimId: popFieldId,
                    dimensions: this.exploreDimensions,
                    dimensionsWithoutAccess:
                        this.exploreDimensionsWithoutAccess,
                    adapterType,
                    startOfWeek,
                    timezone: this.timezoneForDateTrunc,
                    columnTimezone: this.columnTimezone,
                });
                const popDimensionFilters =
                    this.getPopDimensionsFilterSQL(popFieldId);

                const popMetricSelectsInPopCte = popEntries.map((entry) => {
                    const metric = this.getMetricFromId(entry.baseMetricId);
                    return `  ${metric.compiledSql} AS ${fieldQuoteChar}${entry.popMetricId}${fieldQuoteChar}`;
                });

                const popCteParts = [
                    `SELECT\n${[
                        ...Object.values(dimensionsSQL.selects),
                        ...popMetricSelectsInPopCte,
                    ].join(',\n')}`,
                    sqlFrom,
                    joins.joinSQL,
                    ...dimensionsSQL.joins,
                    ...[`LEFT JOIN ${popMinMaxCteName} ON TRUE`],
                    MetricQueryBuilder.combineWhereClauses(
                        popDimensionFilters,
                        `WHERE ${getIntervalSyntax(
                            adapterType,
                            popField.compiledSql,
                            `${popMinMaxCteName}.min_date`,
                            '>=',
                            cfg.periodOffset,
                            cfg.granularity,
                            false,
                        )} AND ${getIntervalSyntax(
                            adapterType,
                            popField.compiledSql,
                            `${popMinMaxCteName}.max_date`,
                            '<=',
                            cfg.periodOffset,
                            cfg.granularity,
                            false,
                        )}`,
                    ),
                    dimensionsSQL.groupBySQL,
                ];

                ctes.push(
                    `${popCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        popCteParts,
                    )}\n)`,
                );

                popMetricSelects.push(
                    ...popEntries.map(
                        (entry) =>
                            `  ${popCteName}.${fieldQuoteChar}${entry.popMetricId}${fieldQuoteChar} AS ${fieldQuoteChar}${entry.popMetricId}${fieldQuoteChar}`,
                    ),
                );

                if (dimensionAlias.length === 0) {
                    popJoins.push(`CROSS JOIN ${popCteName}`);
                    return;
                }

                popJoins.push(
                    `LEFT JOIN ${popCteName} ON ${dimensionAlias
                        .map((alias) => {
                            if (
                                alias ===
                                `${fieldQuoteChar}${popFieldId}${fieldQuoteChar}`
                            ) {
                                return `( ${getIntervalSyntax(
                                    adapterType,
                                    `${baseCteName}.${alias}`,
                                    `${popCteName}.${alias}`,
                                    '=',
                                    cfg.periodOffset,
                                    cfg.granularity,
                                    true,
                                )})`;
                            }
                            return `( ${baseCteName}.${alias} = ${popCteName}.${alias} OR ( ${baseCteName}.${alias} IS NULL AND ${popCteName}.${alias} IS NULL ) )`;
                        })
                        .join(' AND ')}`,
                );
            });

            if (popMetricSelects.length > 0) {
                finalSelectParts = [
                    `SELECT`,
                    [`  ${baseCteName}.*`, ...popMetricSelects].join(',\n'),
                    `FROM ${baseCteName}`,
                    ...popJoins,
                ];
                // DuckDB resolves ORDER BY names against joined sources here, so
                // sorting by a shared dimension alias becomes ambiguous unless we
                // sort from an outer projection.
                requiresQueryInCTE = true;
            }
        }
        warnings.push(...experimentalMetricsCteSQL.warnings);

        // Deduplicated distinct CTE: build separate CTEs for distinct metrics (sum_distinct, average_distinct), joined on dimensions
        const ddMetricIds = this.getSelectedAndReferencedMetricIds().filter(
            (id) => {
                try {
                    const metric = this.getMetricFromId(id);
                    return (
                        metric.type === MetricType.SUM_DISTINCT ||
                        metric.type === MetricType.AVERAGE_DISTINCT
                    );
                } catch {
                    return false;
                }
            },
        );

        if (ddMetricIds.length > 0) {
            const ddBaseCteName = 'dd_base';

            const hasNonDdSelects =
                Object.keys(dimensionsSQL.selects).length > 0 ||
                metricsSQL.selects.length > 0;

            const {
                ctes: ddCtes,
                ddJoins,
                ddMetricSelects,
            } = this.buildDistinctMetricCtes({
                dimensionSelects: dimensionsSQL.selects,
                dimensionGroupBy: dimensionsSQL.groupBySQL,
                dimensionFilters: dimensionsSQL.filtersSQL,
                sqlFrom,
                joinsSql: joins.joinSQL,
                dimensionJoins: dimensionsSQL.joins,
                baseCteName: ddBaseCteName,
            });
            ctes.push(...ddCtes);

            // Build selects for non-aggregate metrics that reference dd metrics.
            // Their SQL templates are recompiled so ${ref} expressions pointing
            // at sum_distinct/average_distinct metrics resolve to the dd CTE
            // aliases instead of the inlined fallback SUM/AVG SQL.
            const nonAggDdMetricIds =
                this.getNonAggregateMetricsReferencingDistinct();
            const nonAggDdSelects: string[] = [];

            // Build CTE map for replaceMetricReferencesWithCteReferences.
            // dd_base must come first (its name is used for dimension resolution).
            // Include all non-dd metrics that land in dd_base so that references
            // like ${unique_customer_count} resolve to dd_base."metric_id"
            // instead of being recompiled as raw SQL (which would reference
            // tables not available in the outer SELECT).
            const ddMetricIdSet = new Set(ddMetricIds);
            const metricsInDdBase =
                this.getSelectedAndReferencedMetricIds().filter(
                    (id) =>
                        !ddMetricIdSet.has(id) && !nonAggDdMetricIds.has(id),
                );
            const ddCteMap: Array<{ name: string; metrics: string[] }> = [
                { name: ddBaseCteName, metrics: metricsInDdBase },
                ...ddMetricIds.map((id) => ({
                    name: `dd_${snakeCaseName(id)}`,
                    metrics: [id],
                })),
            ];
            const ddFieldQuoteChar =
                this.args.warehouseSqlBuilder.getFieldQuoteChar();
            for (const metricId of nonAggDdMetricIds) {
                const metric = this.getMetricFromId(metricId);
                const rewrittenSql =
                    this.replaceMetricReferencesWithCteReferences(
                        metric,
                        ddCteMap,
                    );
                nonAggDdSelects.push(
                    `  ${rewrittenSql} AS ${ddFieldQuoteChar}${metricId}${ddFieldQuoteChar}`,
                );
            }

            if (hasNonDdSelects || nonAggDdSelects.length > 0) {
                ctes.push(
                    MetricQueryBuilder.wrapAsCte(
                        ddBaseCteName,
                        finalSelectParts,
                    ),
                );

                finalSelectParts = [
                    `SELECT`,
                    [
                        `  ${ddBaseCteName}.*`,
                        ...ddMetricSelects,
                        ...nonAggDdSelects,
                    ].join(',\n'),
                    `FROM ${ddBaseCteName}`,
                    ...ddJoins,
                ];
            } else {
                // Only distinct metrics, no dimensions or regular metrics
                // Select directly from the first dd CTE (no base needed)
                finalSelectParts = [
                    `SELECT`,
                    ddMetricSelects.join(',\n'),
                    `FROM ${ddCtes.length > 0 ? `dd_${snakeCaseName(ddMetricIds[0])}` : 'dd_base'}`,
                ];

                // If there are multiple dd CTEs, cross join them
                for (let i = 1; i < ddMetricIds.length; i += 1) {
                    const ddCteName = `dd_${snakeCaseName(ddMetricIds[i])}`;
                    finalSelectParts.push(`CROSS JOIN ${ddCteName}`);
                }
            }
        }

        // Nested aggregate CTEs: build CTE for type:number metrics that wrap
        // aggregate metric references (e.g., sum(${max_metric})) to avoid
        // invalid nested SQL like SUM(MAX(...))
        const nestedAggMetrics = this.getMetricsWithNestedAggregates();
        if (nestedAggMetrics.length > 0) {
            const naBaseCteName = 'na_base';

            const hasNonNaSelects =
                Object.keys(dimensionsSQL.selects).length > 0 ||
                metricsSQL.selects.length > 0;

            const {
                ctes: naCtes,
                naJoins,
                naMetricSelects,
            } = this.buildNestedAggregateCtes({
                dimensionSelects: dimensionsSQL.selects,
                dimensionFilters: dimensionsSQL.filtersSQL,
                sqlFrom,
                joinsSql: joins.joinSQL,
                dimensionJoins: dimensionsSQL.joins,
                baseCteName: naBaseCteName,
            });
            ctes.push(...naCtes);

            if (hasNonNaSelects) {
                ctes.push(
                    MetricQueryBuilder.wrapAsCte(
                        naBaseCteName,
                        finalSelectParts,
                    ),
                );

                // Outer SELECT references nested_agg_results columns as
                // simple column refs — no aggregate functions, no GROUP BY.
                finalSelectParts = [
                    `SELECT`,
                    [`  ${naBaseCteName}.*`, ...naMetricSelects].join(',\n'),
                    `FROM ${naBaseCteName}`,
                    ...naJoins,
                ];
            } else {
                // Only nested aggregate metrics, no dimensions or regular metrics
                finalSelectParts = [
                    `SELECT`,
                    naMetricSelects.join(',\n'),
                    `FROM nested_agg_results`,
                ];
            }
        }

        const { simpleTableCalcs, interdependentTableCalcs } =
            this.getPartitionedTableCalculations();

        const simpleTableCalculationSelects =
            this.createSimpleTableCalculationSelects(simpleTableCalcs);
        const tableCalculationFilters = this.createTableCalculationFilters();

        const needsPostAgg = this.needsPostAggCte({
            requiresQueryInCTE,
            metricsSQL,
        });

        const needsMetricFiltersCte =
            interdependentTableCalcs.length > 0 && !!metricsSQL.filtersSQL;

        const { totalFields, rowTotalFields } = extractTotalReferences(
            this.args.compiledMetricQuery.compiledTableCalculations,
        );
        const hasPivot =
            !!this.args.pivotConfiguration ||
            (this.args.pivotDimensions && this.args.pivotDimensions.length > 0);
        const needsTotalsCtes =
            totalFields.length > 0 || (rowTotalFields.length > 0 && hasPivot);

        if (needsPostAgg) {
            const fieldQuoteChar =
                this.args.warehouseSqlBuilder.getFieldQuoteChar();
            const ctesToAdd: string[] = [];

            // base metrics CTE = dimensions + metrics only (no filters, no table calcs)
            const metricsCteName = 'metrics';
            ctesToAdd.push(
                MetricQueryBuilder.wrapAsCte(metricsCteName, finalSelectParts),
            );
            let currentCteName = metricsCteName;

            // Create PostCalculation metric CTEs
            const {
                ctes: postCalculationCtes,
                finalCteName: postCalculationFinalCteName,
            } = this.createPostCalculationMetricCtes(currentCteName);
            if (postCalculationCtes.length) {
                ctesToAdd.push(...postCalculationCtes);
                currentCteName = postCalculationFinalCteName;
            }

            // Create metric_filters CTE if needed
            if (needsMetricFiltersCte && metricsSQL.filtersSQL) {
                const { cte: metricFilters, cteName: metricFiltersCteName } =
                    MetricQueryBuilder.buildMetricFiltersCte(
                        currentCteName,
                        metricsSQL.filtersSQL,
                    );
                ctesToAdd.push(metricFilters);
                currentCteName = metricFiltersCteName;
            }

            // Create totals CTEs (column_totals, row_totals, with_totals)
            if (needsTotalsCtes) {
                const { ctes: totalsCtes, finalCteName: totalsFinalCteName } =
                    this.buildTotalsCtes({
                        totalFields,
                        rowTotalFields,
                        currentCteName,
                        sqlFrom,
                        joinsSql: joins.joinSQL,
                        dimensionJoins: dimensionsSQL.joins,
                        dimensionFilters: dimensionsSQL.filtersSQL,
                        dimensionSelects: dimensionsSQL.selects,
                    });
                ctesToAdd.push(...totalsCtes);
                currentCteName = totalsFinalCteName;
            }

            // Create table calculation CTEs
            const {
                ctes: tableCalcCtes,
                finalCteName: tableCalcFinalCteName,
                createdSimpleTableCalcsCte,
            } = this.createTableCalculationCtes(
                currentCteName,
                simpleTableCalcs,
                interdependentTableCalcs,
                simpleTableCalculationSelects,
                tableCalculationFilters,
                metricsSQL.filtersSQL,
            );
            if (tableCalcCtes.length) {
                ctesToAdd.push(...tableCalcCtes);
                currentCteName = tableCalcFinalCteName;
            }

            // final SELECT from the last CTE; inline table calcs & metric filters only if we never created their CTEs
            const shouldInlineSimpleCalcs =
                !createdSimpleTableCalcsCte &&
                simpleTableCalculationSelects.length > 0;

            // Get filter-only metrics to exclude from final SELECT
            const { metrics, filters } = compiledMetricQuery;
            const filterOnlyMetricIds = getFilterRulesFromGroup(filters.metrics)
                .map((filter) => filter.target.fieldId)
                .filter((metricId) => !metrics.includes(metricId));

            // Build explicit column list excluding filter-only metrics
            const finalSelectColumns =
                filterOnlyMetricIds.length > 0
                    ? [
                          // Select dimensions
                          ...Object.keys(dimensionsSQL.selects).map(
                              (dimId) =>
                                  `  ${fieldQuoteChar}${dimId}${fieldQuoteChar}`,
                          ),
                          // Select only originally selected metrics (not filter-only)
                          ...metrics.map(
                              (metricId) =>
                                  `  ${fieldQuoteChar}${metricId}${fieldQuoteChar}`,
                          ),
                          ...interdependentTableCalcs.map(
                              (tableCalc) =>
                                  `  ${fieldQuoteChar}${tableCalc.name}${fieldQuoteChar}`,
                          ),
                          // Include simple table calcs - either inlined or from CTE
                          ...(shouldInlineSimpleCalcs
                              ? simpleTableCalculationSelects
                              : simpleTableCalcs.map(
                                    (tableCalc) =>
                                        `  ${fieldQuoteChar}${tableCalc.name}${fieldQuoteChar}`,
                                )),
                      ]
                    : [
                          '  *',
                          ...(shouldInlineSimpleCalcs
                              ? simpleTableCalculationSelects
                              : []),
                      ];

            const whereClause =
                createdSimpleTableCalcsCte ||
                interdependentTableCalcs.length > 0
                    ? tableCalculationFilters
                    : metricsSQL.filtersSQL;

            const finalFromName = currentCteName; // last dependent CTE if any, otherwise `current`
            finalSelectParts = [
                `SELECT\n${finalSelectColumns.join(',\n')}`,
                `FROM ${finalFromName}`,
                whereClause,
            ];
            ctes.push(...ctesToAdd);
        }

        const query = MetricQueryBuilder.assembleSqlParts([
            MetricQueryBuilder.buildCtesSQL(ctes),
            ...finalSelectParts,
            sqlOrderBy,
            sqlLimit,
        ]);

        const {
            replacedSql,
            references: parameterReferences,
            missingReferences: missingParameterReferences,
        } = safeReplaceParametersWithTypes({
            sql: query,
            parameterValuesMap: this.args.parameters ?? {},
            parameterDefinitions: this.args.parameterDefinitions,
            sqlBuilder: this.args.warehouseSqlBuilder,
            fieldsContext: this.buildFieldsContext(),
        });

        // Also collect parameter references from fields (e.g., format strings)
        Object.values(fields).forEach((field) => {
            if ('parameterReferences' in field && field.parameterReferences) {
                field.parameterReferences.forEach((ref: string) => {
                    parameterReferences.add(ref);
                });
            }
        });

        if (missingParameterReferences.size > 0) {
            warnings.push({
                message: `Missing parameters: ${Array.from(
                    missingParameterReferences,
                ).join(', ')}`,
            });
        }

        // Filter parameters to only include those that are referenced in the query
        const usedParameters: ParametersValuesMap = Object.fromEntries(
            Object.entries(this.args.parameters ?? {}).filter(([key]) =>
                parameterReferences.has(key),
            ),
        );

        return {
            query: replacedSql,
            fields,
            warnings,
            parameterReferences,
            missingParameterReferences,
            usedParameters,
            compilationErrors: this.compilationErrors,
        };
    }
}
