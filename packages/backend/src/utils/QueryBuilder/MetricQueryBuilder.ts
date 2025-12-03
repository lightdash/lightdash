import {
    CompiledDimension,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTable,
    CompiledTableCalculation,
    CompileError,
    createFilterRuleFromModelRequiredFilterRule,
    Explore,
    ExploreCompiler,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    getCustomMetricDimensionId,
    getDimensions,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getItemId,
    getParsedReference,
    IntrinsicUserAttributes,
    isAndFilterGroup,
    isCompiledCustomSqlDimension,
    isCustomBinDimension,
    isFilterGroup,
    isFilterRuleInQuery,
    isJoinModelRequiredFilter,
    isMetric,
    isNonAggregateMetric,
    isPostCalculationMetric,
    ItemsMap,
    lightdashVariablePattern,
    MetricFilterRule,
    parseAllReferences,
    PivotConfiguration,
    POP_PREVIOUS_PERIOD_SUFFIX,
    QueryWarning,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    snakeCaseName,
    SortField,
    SupportedDbtAdapter,
    TimeFrames,
    UserAttributeValueMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
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
    getMetricFromId,
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
    timezone: string;
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
 * Converts QUARTER interval to 3 months for databases that don't support QUARTER.
 * @param value - The interval value
 * @param granularity - The time granularity
 * @returns Tuple of [convertedValue, convertedGranularity]
 */
function convertQuarterToMonths(
    value: number,
    granularity: string,
): [number, string] {
    const upperGranularity = granularity.toUpperCase();

    if (upperGranularity === 'QUARTER') {
        return [value * 3, 'MONTH'];
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
            const [dbValue, dbGranularity] = convertQuarterToMonths(
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
            // Redshift uses standard interval arithmetic
            // Redshift doesn't support QUARTER interval, convert to months
            const [redshiftValue, redshiftGranularity] = convertQuarterToMonths(
                value,
                granularity,
            );
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${redshiftValue} ${redshiftGranularity}'`;
            break;
        }
        case SupportedDbtAdapter.POSTGRES: {
            // Postgres uses standard interval arithmetic
            // Postgres doesn't support QUARTER interval, convert to months
            const [pgValue, pgGranularity] = convertQuarterToMonths(
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
            // Trino doesn't support QUARTER interval, convert to months
            const [trinoValue, trinoGranularity] = convertQuarterToMonths(
                value,
                granularity,
            );
            intervalExpression = `${columnWithInterval} ${
                isAdd ? '+' : '-'
            } INTERVAL '${trinoValue}' ${trinoGranularity}`;
            break;
        }
        case SupportedDbtAdapter.CLICKHOUSE: {
            // ClickHouse uses date arithmetic functions
            // ClickHouse doesn't support QUARTER interval, convert to months
            const [chValue, chGranularity] = convertQuarterToMonths(
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
    constructor(private args: BuildQueryProps) {}

    static buildCtesSQL(ctes: string[]) {
        return ctes.length > 0 ? `WITH ${ctes.join(',\n')}` : undefined;
    }

    static assembleSqlParts(parts: Array<string | undefined>) {
        return parts.filter((l) => l !== undefined).join('\n');
    }

    private getDimensionsFilterSQL() {
        const {
            explore,
            compiledMetricQuery,
            warehouseSqlBuilder,
            userAttributes = {},
            intrinsicUserAttributes,
        } = this.args;
        const { filters } = compiledMetricQuery;

        const requiredDimensionFilterSql =
            this.getNestedDimensionFilterSQLFromModelFilters(
                explore.tables[explore.baseTable],
                filters.dimensions,
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
            filters.dimensions,
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
                const dimension = getDimensionFromId(
                    field,
                    explore,
                    adapterType,
                    startOfWeek,
                );

                assertValidDimensionRequiredAttribute(
                    dimension,
                    userAttributes,
                    `dimension: "${field}"`,
                );
                return dimension;
            });
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
            sorts,
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
                const dim = getDimensionFromFilterTargetId(
                    filterRule.target.fieldId,
                    explore,
                    compiledCustomDimensions.filter(
                        isCompiledCustomSqlDimension,
                    ),
                    adapterType,
                    startOfWeek,
                );
                return [...acc, ...(dim.tablesReferences || [dim.table])];
            }, [])
            .forEach((table) => {
                tables.push(table);
            });

        // Selects
        const selects: Record<string, string> = {};

        dimensionsObjects.forEach((dimension) => {
            const id = getItemId(dimension);
            const quotedAlias = `${fieldQuoteChar}${id}${fieldQuoteChar}`;
            selects[id] = `  ${dimension.compiledSql} AS ${quotedAlias}`;
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
        const { explore, compiledMetricQuery } = this.args;
        const { metrics } = compiledMetricQuery;
        return metrics.filter((metricId) => {
            const metric = getMetricFromId(
                metricId,
                explore,
                compiledMetricQuery,
            );
            return isPostCalculationMetric(metric);
        });
    }

    /**
     * Returns the list of metrics that are referenced in PostCalculation metrics.
     * @param metricIds
     * @private
     */
    private getPostCalculationMetricReferences(metricIds: string[]): string[] {
        const { explore, compiledMetricQuery } = this.args;
        const referencedMetricIds = new Set<string>();
        metricIds.forEach((metricId) => {
            const metric = getMetricFromId(
                metricId,
                explore,
                compiledMetricQuery,
            );
            if (isPostCalculationMetric(metric)) {
                // Extract referenced metrics from PostCalculation metric SQL
                const references = parseAllReferences(metric.sql, metric.table);
                references.forEach((ref) => {
                    const referencedMetricId = getItemId({
                        table: ref.refTable,
                        name: ref.refName,
                    });
                    const referencedMetric = getMetricFromId(
                        referencedMetricId,
                        explore,
                        compiledMetricQuery,
                    );
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
        const { explore, compiledMetricQuery } = this.args;
        const { metrics, filters } = compiledMetricQuery;

        // Regular metrics
        const referencedMetricIds = new Set<string>(metrics);

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

        // Exclude PostCalculation metrics
        return Array.from(referencedMetricIds).filter((metricId) => {
            const metric = getMetricFromId(
                metricId,
                explore,
                compiledMetricQuery,
            );
            return !isPostCalculationMetric(metric);
        });
    }

    private getMetricsSQL(): {
        tables: string[];
        selects: string[];
        filtersSQL: string | undefined;
    } {
        const {
            explore,
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
                const dimension = getDimensionFromId(
                    dimensionId,
                    explore,
                    adapterType,
                    startOfWeek,
                );

                assertValidDimensionRequiredAttribute(
                    dimension,
                    userAttributes,
                    `custom metric: "${metric.name}"`,
                );
            });
        }

        const selects = new Set<string>();
        const tables = new Set<string>();
        metrics.forEach((field) => {
            const alias = field;
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            // Add select
            selects.add(
                `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`,
            );
            // Add tables
            (metric.tablesReferences || [metric.table]).forEach((table) =>
                tables.add(table),
            );
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
        return simpleTableCalcs.map((tableCalculation) => {
            const alias = tableCalculation.name;
            return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
        });
    }

    private createTableCalculationFilters(): string | undefined {
        const { compiledMetricQuery, warehouseSqlBuilder } = this.args;
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

                    return replacedSql;
                }
                return value;
            }),
        };

        if (!fieldType) {
            const field = compiledMetricQuery.compiledTableCalculations?.find(
                (tc) =>
                    getItemId(tc) ===
                    filterRuleWithParamReplacedValues.target.fieldId,
            );
            return renderTableCalculationFilterRuleSql(
                filterRuleWithParamReplacedValues,
                field,
                fieldQuoteChar,
                stringQuoteChar,
                escapeString,
                adapterType,
                startOfWeek,
                timezone,
            );
        }

        const field =
            fieldType === FieldType.DIMENSION
                ? [
                      ...getDimensions(explore),
                      ...compiledCustomDimensions.filter(
                          isCompiledCustomSqlDimension,
                      ),
                  ].find(
                      (d) =>
                          getItemId(d) ===
                          filterRuleWithParamReplacedValues.target.fieldId,
                  )
                : getMetricFromId(
                      filterRuleWithParamReplacedValues.target.fieldId,
                      explore,
                      compiledMetricQuery,
                  );
        if (!field) {
            throw new FieldReferenceError(
                `Filter has a reference to an unknown ${fieldType}: ${filterRuleWithParamReplacedValues.target.fieldId}`,
            );
        }

        return renderFilterRuleSqlFromField(
            filterRuleWithParamReplacedValues,
            field,
            fieldQuoteChar,
            stringQuoteChar,
            escapeString,
            startOfWeek,
            adapterType,
            timezone,
        );
    }

    static getNullsFirstLast(sort: SortField) {
        if (sort.nullsFirst === undefined) return '';
        return sort.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
    }

    private getSortSQL(excludePostCalculationMetrics: boolean = false) {
        const { explore, compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const { sorts, metrics, compiledCustomDimensions } =
            compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
        const compiledDimensions = getDimensions(explore);
        let requiresQueryInCTE = false;
        const fieldOrders = sorts.reduce<string[]>((acc, sort) => {
            // Default sort
            let fieldSort: string = `${fieldQuoteChar}${
                sort.fieldId
            }${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }${MetricQueryBuilder.getNullsFirstLast(sort)}`;

            const sortedDimension = compiledDimensions.find(
                (d) => getItemId(d) === sort.fieldId,
            );

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
                const metric = getMetricFromId(
                    sort.fieldId,
                    explore,
                    compiledMetricQuery,
                );
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
                metrics: metrics.map((field) =>
                    getMetricFromId(field, explore, compiledMetricQuery),
                ),
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

        const processedSql = metric.sql.replace(
            lightdashVariablePattern,
            (fullmatch, ref) => {
                const { refTable, refName } = getParsedReference(
                    ref,
                    metric.table,
                );
                const metricId = getItemId({ table: refTable, name: refName });
                const containingCte = metricCtes.find((cte) =>
                    cte.metrics.includes(metricId),
                );
                if (containingCte) {
                    // Replace the metric reference with CTE reference
                    return `${containingCte.name}.${fieldQuoteChar}${metricId}${fieldQuoteChar}`;
                }
                return fullmatch;
            },
        );

        // Handle any remaining reference that isn't in CTEs
        const exploreCompiler = new ExploreCompiler(warehouseSqlBuilder);
        const compiledMetric = exploreCompiler.compileMetricSql(
            { ...metric, sql: processedSql }, // use preprocessed SQL with CTE references resolved
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
        const { metrics, filters, periodOverPeriod } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const stringQuoteChar = warehouseSqlBuilder.getStringQuoteChar();
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
            getMetricFromId(field, explore, compiledMetricQuery),
        );
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
                    metricsWithCteReferences.push(metricObject);
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
                                getMetricFromId(
                                    getItemId({
                                        table: metricReference.refTable,
                                        name: metricReference.refName,
                                    }),
                                    explore,
                                    compiledMetricQuery,
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
        const popMetricCtes: Array<{ name: string; metrics: string[] }> = [];
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
                        ...table.primaryKey.map(
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
                    }${fieldQuoteChar} ON ${table.primaryKey
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

                if (periodOverPeriod?.field) {
                    const popFieldId = getItemId(periodOverPeriod?.field);
                    /**
                     * CTE to get min and max date in deduplicated keys
                     */
                    const popMinMaxCteName = `cte_pop_min_max_${snakeCaseName(
                        tableName,
                    )}`;
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
                    const popKeysCteName = `cte_pop_keys_${snakeCaseName(
                        tableName,
                    )}`;
                    const popField = getDimensionFromId(
                        popFieldId,
                        explore,
                        adapterType,
                        startOfWeek,
                    );
                    const popKeysCteParts = [
                        `SELECT DISTINCT`,
                        [
                            ...Object.values(dimensionSelects),
                            ...table.primaryKey.map(
                                (pk) =>
                                    `  ${fieldQuoteChar}${table.name}${fieldQuoteChar}.${pk} AS ${fieldQuoteChar}pk_${pk}${fieldQuoteChar}`,
                            ),
                        ].join(',\n'),
                        sqlFrom,
                        ...[...joins, `LEFT JOIN ${popMinMaxCteName} ON TRUE`],
                        `WHERE ${getIntervalSyntax(
                            adapterType,
                            popField.compiledSql,
                            `${popMinMaxCteName}.min_date`,
                            '>=',
                            periodOverPeriod.periodOffset || 1,
                            periodOverPeriod.granularity,
                            false,
                        )} AND ${getIntervalSyntax(
                            adapterType,
                            popField.compiledSql,
                            `${popMinMaxCteName}.max_date`,
                            '<=',
                            periodOverPeriod.periodOffset || 1,
                            periodOverPeriod.granularity,
                            false,
                        )}`,
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
                    )}`;
                    const popMetricsCteParts = [
                        `SELECT`,
                        [
                            ...dimensionAlias.map(
                                (alias) => `  ${popKeysCteName}.${alias}`,
                            ),
                            ...metricsInCte.map(
                                (metric) =>
                                    `  ${
                                        metric.compiledSql
                                    } AS ${fieldQuoteChar}${getItemId(
                                        metric,
                                    )}${POP_PREVIOUS_PERIOD_SUFFIX}${fieldQuoteChar}`,
                            ),
                        ].join(',\n'),
                        `FROM ${popKeysCteName}`,
                        `LEFT JOIN ${popJoinTable} AS ${fieldQuoteChar}${
                            table.name
                        }${fieldQuoteChar} ON ${table.primaryKey
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
                        metrics: metricsInCte.map(
                            (metric) =>
                                `${getItemId(
                                    metric,
                                )}${POP_PREVIOUS_PERIOD_SUFFIX}`,
                        ),
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
                return notInMetricCtes && notMetricWithCteReferences;
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
                Object.keys(dimensionSelects).length > 0 ||
                !!dimensionFilters;

            if (hasUnaffectedCte) {
                ctes.push(
                    `${unaffectedMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        unaffectedMetricsCteParts,
                    )}\n)`,
                );
            }
            // Create PoP CTEs for unaffected metrics
            const popUnaffectedMetricsCteName = `cte_pop_unaffected`;
            if (periodOverPeriod?.field && hasUnaffectedCte) {
                const popFieldId = getItemId(periodOverPeriod?.field);

                /**
                 * CTE to get min and max date in unaffected metrics
                 */
                const popUnaffectedMinMaxCteName = `cte_pop_unaffected_min_max`;
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

                const popField = getDimensionFromId(
                    popFieldId,
                    explore,
                    adapterType,
                    startOfWeek,
                );
                /**
                 * CTE for PoP unaffected metrics
                 * Filters are PoP specific rather than metric query filters
                 */
                const popUnaffectedMetricsCteParts = [
                    'SELECT',
                    [
                        ...Object.values(dimensionSelects),
                        ...unaffectedMetrics.map(
                            (metric) =>
                                `  ${
                                    metric.compiledSql
                                } AS ${fieldQuoteChar}${getItemId(
                                    metric,
                                )}${POP_PREVIOUS_PERIOD_SUFFIX}${fieldQuoteChar}`,
                        ),
                    ].join(',\n'),
                    sqlFrom,
                    ...[
                        ...joins,
                        `LEFT JOIN ${popUnaffectedMinMaxCteName} ON TRUE`,
                    ],
                    `WHERE ${getIntervalSyntax(
                        adapterType,
                        popField.compiledSql,
                        `${popUnaffectedMinMaxCteName}.min_date`,
                        '>=',
                        periodOverPeriod.periodOffset || 1,
                        periodOverPeriod.granularity,
                        false,
                    )} AND ${getIntervalSyntax(
                        adapterType,
                        popField.compiledSql,
                        `${popUnaffectedMinMaxCteName}.max_date`,
                        '<=',
                        periodOverPeriod.periodOffset || 1,
                        periodOverPeriod.granularity,
                        false,
                    )}`,
                    dimensionGroupBy,
                ];
                ctes.push(
                    `${popUnaffectedMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        popUnaffectedMetricsCteParts,
                    )}\n)`,
                );
                popMetricCtes.push({
                    name: popUnaffectedMetricsCteName,
                    metrics: unaffectedMetrics.map(
                        (metric) =>
                            `${getItemId(metric)}${POP_PREVIOUS_PERIOD_SUFFIX}`,
                    ),
                });
            }

            const finalMetricSelects = [
                ...metricsWithCteReferences.map((metric) => {
                    // For metrics with cross-table references, replace metric references with CTE references
                    const processedSql =
                        this.replaceMetricReferencesWithCteReferences(metric, [
                            ...metricCtes,
                            // add unaffected metrics CTE to the list, so non-inflation metrics can be referenced
                            {
                                name: unaffectedMetricsCteName,
                                metrics: unaffectedMetrics.map((m) =>
                                    getItemId(m),
                                ),
                            },
                        ]);

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
                        .filter((metric) =>
                            metricsObjects.find(
                                (m) =>
                                    metric ===
                                    `${getItemId(
                                        m,
                                    )}${POP_PREVIOUS_PERIOD_SUFFIX}`,
                            ),
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
             *   - when there are dimensions, use INNER JOIN on all dimensions (+ or null)
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
                            return ``; // no need to join on PoP metrics
                        }
                        return `INNER JOIN ${
                            popMetricCte.name
                        } ON ${dimensionAlias
                            .map((alias) => {
                                const popFieldId = periodOverPeriod
                                    ? getItemId(periodOverPeriod?.field)
                                    : undefined;
                                if (
                                    periodOverPeriod &&
                                    alias ===
                                        `${fieldQuoteChar}${popFieldId}${fieldQuoteChar}`
                                ) {
                                    // join on PoP field with interval diff
                                    const popField = getDimensionFromId(
                                        popFieldId!,
                                        explore,
                                        adapterType,
                                        startOfWeek,
                                    );
                                    return `( ${getIntervalSyntax(
                                        adapterType,
                                        `${unaffectedMetricsCteName}.${alias}`,
                                        `${popMetricCte.name}.${alias}`,
                                        '=',
                                        periodOverPeriod.periodOffset || 1,
                                        periodOverPeriod.granularity,
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
        const { warehouseSqlBuilder, compiledMetricQuery } = this.args;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        // Sort table calculations in dependency order
        const sortedTableCalcs = this.sortTableCalcsByDependencies(
            interdependentTableCalcs,
        );
        const ctes: string[] = [];
        let lastCteName = currentName;

        for (const tc of sortedTableCalcs) {
            const cteName = `tc_${tc.name}`;

            const parts = [
                'SELECT',
                [
                    '  *',
                    `  ${tc.compiledSql} AS ${fieldQuoteChar}${tc.name}${fieldQuoteChar}`,
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
        const {
            explore,
            compiledMetricQuery,
            warehouseSqlBuilder,
            pivotConfiguration,
        } = this.args;
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
            const metric = getMetricFromId(
                metricId,
                explore,
                compiledMetricQuery,
            );
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
        const { sqlOrderBy, requiresQueryInCTE } = this.getSortSQL();
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
        } else if (compiledMetricQuery.periodOverPeriod?.field) {
            // 1. Wrap finalSelectParts as a CTE
            // 2. Generate pop CTEs based on this CTE
            // 3. Create new finalSelectParts that joins everything

            const { periodOverPeriod } = compiledMetricQuery;
            const fieldQuoteChar =
                this.args.warehouseSqlBuilder.getFieldQuoteChar();
            const stringQuoteChar =
                this.args.warehouseSqlBuilder.getStringQuoteChar();
            const adapterType: SupportedDbtAdapter =
                this.args.warehouseSqlBuilder.getAdapterType();
            const startOfWeek = this.args.warehouseSqlBuilder.getStartOfWeek();

            // Wrap current finalSelectParts as base CTE
            const baseCteName = 'base_metrics';
            ctes.push(
                MetricQueryBuilder.wrapAsCte(baseCteName, finalSelectParts),
            );

            const popFieldId = getItemId(periodOverPeriod.field);

            // Create pop_min_max CTE to get date range
            const popMinMaxCteName = 'pop_min_max';
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

            // Create pop CTE with previous period data
            const popCteName = 'pop_metrics';
            const popField = getDimensionFromId(
                popFieldId,
                explore,
                adapterType,
                startOfWeek,
            );

            // Build pop CTE with same structure as base but filtered for previous period
            const popCteParts = [
                `SELECT\n${[
                    ...Object.values(dimensionsSQL.selects),
                    ...metricsSQL.selects.map((select) =>
                        // rename metric to include pop prefix
                        select.replace(
                            new RegExp(`${fieldQuoteChar}$`),
                            `${POP_PREVIOUS_PERIOD_SUFFIX}${fieldQuoteChar}`,
                        ),
                    ),
                ].join(',\n')}`,
                sqlFrom,
                joins.joinSQL,
                ...dimensionsSQL.joins,
                ...[`LEFT JOIN ${popMinMaxCteName} ON TRUE`],
                `WHERE ${getIntervalSyntax(
                    adapterType,
                    popField.compiledSql,
                    `${popMinMaxCteName}.min_date`,
                    '>=',
                    periodOverPeriod.periodOffset || 1,
                    periodOverPeriod.granularity,
                    false,
                )} AND ${getIntervalSyntax(
                    adapterType,
                    popField.compiledSql,
                    `${popMinMaxCteName}.max_date`,
                    '<=',
                    periodOverPeriod.periodOffset || 1,
                    periodOverPeriod.granularity,
                    false,
                )}`,
                dimensionsSQL.groupBySQL,
            ];

            ctes.push(
                `${popCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                    popCteParts,
                )}\n)`,
            );

            // Create new finalSelectParts that joins base CTE with pop CTE
            const popMetricSelects = compiledMetricQuery.metrics.map(
                (metricId) =>
                    `  ${popCteName}.${fieldQuoteChar}${metricId}${POP_PREVIOUS_PERIOD_SUFFIX}${fieldQuoteChar} AS ${fieldQuoteChar}${metricId}${POP_PREVIOUS_PERIOD_SUFFIX}${fieldQuoteChar}`,
            );
            // Get dimension aliases from dimensionSelects
            const dimensionAlias = Object.keys(dimensionsSQL.selects).map(
                (alias) => `${fieldQuoteChar}${alias}${fieldQuoteChar}`,
            );
            // With dimensions: join on dimensions with interval adjustment for pop field
            finalSelectParts = [
                `SELECT`,
                [`  ${baseCteName}.*`, ...popMetricSelects].join(',\n'),
                `FROM ${baseCteName}`,
                `INNER JOIN ${popCteName} ON ${dimensionAlias
                    .map((alias) => {
                        if (
                            alias ===
                            `${fieldQuoteChar}${popFieldId}${fieldQuoteChar}`
                        ) {
                            // Join on pop field with interval difference
                            return `( ${getIntervalSyntax(
                                adapterType,
                                `${baseCteName}.${alias}`,
                                `${popCteName}.${alias}`,
                                '=',
                                periodOverPeriod.periodOffset || 1,
                                periodOverPeriod.granularity,
                                true,
                            )})`;
                        }
                        // Default to joining on all dimensions
                        return `( ${baseCteName}.${alias} = ${popCteName}.${alias} OR ( ${baseCteName}.${alias} IS NULL AND ${popCteName}.${alias} IS NULL ) )`;
                    })
                    .join(' AND ')}`,
            ];
        }
        warnings.push(...experimentalMetricsCteSQL.warnings);

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

        if (needsPostAgg) {
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

            const fieldQuoteChar =
                this.args.warehouseSqlBuilder.getFieldQuoteChar();

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
        };
    }
}
