import {
    CompiledDimension,
    CompiledMetric,
    CompiledMetricQuery,
    CompiledTable,
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
    isNonAggregateMetric,
    ItemsMap,
    lightdashVariablePattern,
    MetricFilterRule,
    parseAllReferences,
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
    timezone: string;
};

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
        const { metrics, filters, additionalMetrics } = compiledMetricQuery;
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

        // Find metrics from metric query
        const selects = metrics.map((field) => {
            const alias = field;
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            return `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
        });

        // Find metrics in filters
        const selectsFromFilters = getFilterRulesFromGroup(
            filters.metrics,
        ).reduce<string[]>((acc, filter) => {
            const metricInSelect = metrics.find(
                (metric) => metric === filter.target.fieldId,
            );
            if (metricInSelect !== undefined) {
                return acc;
            }
            const alias = filter.target.fieldId;
            const metric = getMetricFromId(
                filter.target.fieldId,
                explore,
                compiledMetricQuery,
            );
            const renderedSql = `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
            return acc.includes(renderedSql) ? acc : [...acc, renderedSql];
        }, []);

        // Tables
        const tables = metrics.reduce<string[]>((acc, field) => {
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            return [...acc, ...(metric.tablesReferences || [metric.table])];
        }, []);
        // Add tables referenced in metrics filters
        getFilterRulesFromGroup(filters.metrics)
            .reduce<string[]>((acc, filterRule) => {
                const metric = getMetricFromId(
                    filterRule.target.fieldId,
                    explore,
                    compiledMetricQuery,
                );
                return [...acc, ...(metric.tablesReferences || [metric.table])];
            }, [])
            .forEach((table) => {
                tables.push(table);
            });

        // Filters
        const filtersSQL = this.getNestedFilterSQLFromGroup(
            filters.metrics,
            FieldType.METRIC,
        );

        return {
            selects: [...selects, ...selectsFromFilters],
            tables,
            filtersSQL: filtersSQL ? `WHERE ${filtersSQL}` : undefined,
        };
    }

    private hasAnyTableCalcs(): boolean {
        return (
            this.args.compiledMetricQuery.compiledTableCalculations.length > 0
        );
    }

    static hasSimpleTableCalcs(simpleSelects: string[]): boolean {
        return simpleSelects.length > 0;
    }

    private hasDependentTableCalcCtes(): boolean {
        return this.args.compiledMetricQuery.compiledTableCalculations.some(
            (tc) => tc.cte,
        );
    }

    static hasMetricFilters(metricsSQL: { filtersSQL?: string }): boolean {
        return Boolean(metricsSQL.filtersSQL);
    }

    private tableCalcCTEsAreNeeded(opts: {
        requiresQueryInCTE: boolean;
        simpleSelects: string[];
        metricsSQL: { filtersSQL?: string };
    }): boolean {
        return (
            opts.requiresQueryInCTE ||
            this.hasAnyTableCalcs() ||
            MetricQueryBuilder.hasSimpleTableCalcs(opts.simpleSelects) ||
            MetricQueryBuilder.hasMetricFilters(opts.metricsSQL)
        );
    }

    private getTableCalculationsSQL(): {
        selects: string[];
        filtersSQL: string | undefined;
    } {
        const { compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const { filters } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        // Selects for table calculations that don't have CTEs
        const selects = compiledMetricQuery.compiledTableCalculations
            .filter((tc) => !tc.cte)
            .map((tableCalculation) => {
                const alias = tableCalculation.name;
                return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
            });

        // Filters
        const tableCalculationFilters = this.getNestedFilterSQLFromGroup(
            filters.tableCalculations,
        );

        return {
            selects, // Return the simple table calc selects so they can be used in CTE logic
            filtersSQL: tableCalculationFilters
                ? ` WHERE ${tableCalculationFilters}`
                : undefined,
        };
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

    private getSortSQL() {
        const { explore, compiledMetricQuery, warehouseSqlBuilder } = this.args;
        const { sorts, compiledCustomDimensions } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();
        const startOfWeek = warehouseSqlBuilder.getStartOfWeek();
        const compiledDimensions = getDimensions(explore);
        let requiresQueryInCTE = false;
        const fieldOrders = sorts.map((sort) => {
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
                return `${fieldQuoteChar}${
                    sort.fieldId
                }_order${fieldQuoteChar}${
                    sort.descending ? ' DESC' : ''
                }${MetricQueryBuilder.getNullsFirstLast(sort)}`;
            }
            const sortedDimension = compiledDimensions.find(
                (d) => getItemId(d) === sort.fieldId,
            );

            if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.MONTH_NAME
            ) {
                requiresQueryInCTE = true;

                return sortMonthName(
                    sortedDimension,
                    warehouseSqlBuilder.getFieldQuoteChar(),
                    sort.descending,
                );
            }
            if (
                sortedDimension &&
                sortedDimension.timeInterval === TimeFrames.DAY_OF_WEEK_NAME
            ) {
                // in BigQuery, we cannot use a function in the ORDER BY clause that references a column that is not aggregated or grouped
                // so we need to wrap the query in a CTE to allow us to reference the column in the ORDER BY clause
                // for consistency, we do it for all warehouses
                requiresQueryInCTE = true;
                return sortDayOfWeekName(
                    sortedDimension,
                    startOfWeek,
                    warehouseSqlBuilder.getFieldQuoteChar(),
                    sort.descending,
                );
            }
            return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }${MetricQueryBuilder.getNullsFirstLast(sort)}`;
        });

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
        const { metrics } = compiledMetricQuery;
        const fieldQuoteChar = warehouseSqlBuilder.getFieldQuoteChar();

        // Find tables that potentially have metric inflation and tables without relationship value
        const { tablesWithMetricInflation, joinWithoutRelationship } =
            findTablesWithMetricInflation({
                tables: explore.tables,
                possibleJoins: explore.joinedTables,
                baseTable: explore.baseTable,
                joinedTables,
            });

        const metricsObjects = metrics.map((field) =>
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
                ctes.push(
                    `${unaffectedMetricsCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        unaffectedMetricsCteParts,
                    )}\n)`,
                );
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

    // utilities for compiling queries
    static wrapAsCte(name: string, parts: Array<string | undefined>): string {
        return `${name} AS (\n${MetricQueryBuilder.assembleSqlParts(parts)}\n)`;
    }

    private static escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private static replaceFromSourceName(
        sql: string,
        fromName: string,
        toName: string,
    ): string {
        const escaped = MetricQueryBuilder.escapeRegExp(fromName);
        // matches: FROM metrics | FROM "metrics" | FROM `metrics`
        const pattern = new RegExp(
            `\\bFROM\\s+([\\\`"]?)${escaped}\\1\\b`,
            'gi',
        );
        return sql.replace(
            pattern,
            (_m, quote: string) => `FROM ${quote}${toName}${quote}`,
        );
    }

    static extractCteName(cteSql: string): string | undefined {
        const m = cteSql.match(/^\s*("?)([A-Za-z_][\w$]*)\1\s+AS\b/i);
        return m?.[2];
    }

    static buildSimpleCalcsCte(
        currentName: string,
        simpleSelects: string[],
        hasDependendTableCalcs: boolean = false,
        hasTableCalcFilters: boolean = false,
    ): { next: string; cte?: string } {
        if (!MetricQueryBuilder.hasSimpleTableCalcs(simpleSelects))
            return { next: currentName };

        // Create simple_calcs CTE if either:
        // 1. There are dependent table calculations that need it as foundation, OR
        // 2. There are table calculation filters that need to reference the calculated columns
        if (!hasDependendTableCalcs && !hasTableCalcFilters) {
            return { next: currentName }; // Don't create CTE, let simple calcs go to final SELECT
        }

        const name = 'simple_calcs';
        const parts = [
            'SELECT',
            ['  *', ...simpleSelects].join('\n,'),
            `FROM ${currentName}`,
        ];
        return { next: name, cte: MetricQueryBuilder.wrapAsCte(name, parts) };
    }

    // Build the optional metric_filters CTE; return next cte name + cte text (if created)
    static buildMetricFiltersCte(
        currentName: string,
        metricsFiltersSQL?: string,
        hasDependendTableCalcs: boolean = false,
    ): { next: string; cte?: string } {
        if (!metricsFiltersSQL) return { next: currentName };

        // Only create metric_filters CTE if there are dependent table calculations that need it
        if (!hasDependendTableCalcs) {
            return { next: currentName }; // Don't create CTE, let metric filters go to final SELECT
        }

        const name = 'metric_filters';
        const parts = [
            'SELECT',
            '  *',
            `FROM ${currentName}`,
            metricsFiltersSQL,
        ];
        return { next: name, cte: MetricQueryBuilder.wrapAsCte(name, parts) };
    }

    // If there are dependent Table Calc CTEs, update their FROM to the current CTE and return them + last name.
    private buildDependentTableCalcCtes(currentName: string) {
        const tableCalcsWithCtes =
            this.args.compiledMetricQuery.compiledTableCalculations.filter(
                (tc) => tc.cte,
            );

        if (tableCalcsWithCtes.length === 0) {
            return { ctes: [] as string[], lastName: currentName };
        }

        const updated = tableCalcsWithCtes.map((tc) =>
            MetricQueryBuilder.replaceFromSourceName(
                tc.cte!,
                'metrics',
                currentName,
            ),
        );

        const lastName =
            MetricQueryBuilder.extractCteName(updated[updated.length - 1]) ??
            currentName;

        return { ctes: updated, lastName };
    }

    // Combine WHERE fragments (strip leading WHERE if present)
    static combineWhereClauses(
        ...clauses: Array<string | undefined>
    ): string | undefined {
        const normalized = clauses
            .filter(Boolean)
            .map((c) => c!.replace(/^\s*WHERE\s+/i, '').trim())
            .filter((c) => c.length > 0);
        return normalized.length
            ? `WHERE ${normalized.join(' AND ')}`
            : undefined;
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

        const tableCalculationSQL = this.getTableCalculationsSQL();
        const tableCalcsWithCtes =
            compiledMetricQuery.compiledTableCalculations.filter(
                (tc) => tc.cte,
            );

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
        }
        warnings.push(...experimentalMetricsCteSQL.warnings);

        const needsPostAgg = this.tableCalcCTEsAreNeeded({
            requiresQueryInCTE,
            simpleSelects: tableCalculationSQL.selects,
            metricsSQL,
        });

        if (needsPostAgg) {
            const ctesToAdd: string[] = [];

            // base metrics CTE = dimensions + metrics only (no filters, no table calcs)
            const metricsCteName = 'metrics';
            ctesToAdd.push(
                MetricQueryBuilder.wrapAsCte(metricsCteName, finalSelectParts),
            );
            let current = metricsCteName;

            // metric filters CTE
            const metricFilters = MetricQueryBuilder.buildMetricFiltersCte(
                current,
                metricsSQL.filtersSQL,
                this.hasDependentTableCalcCtes(), // Only create CTE if there are dependent table calcs
            );
            if (metricFilters.cte) ctesToAdd.push(metricFilters.cte);
            current = metricFilters.next;

            // simple calcs CTE
            const simpleTableCalcSelects =
                MetricQueryBuilder.buildSimpleCalcsCte(
                    current,
                    tableCalculationSQL.selects,
                    this.hasDependentTableCalcCtes(), // Create CTE if there are dependent table calcs
                    Boolean(tableCalculationSQL.filtersSQL), // Create CTE if there are table calc filters
                );
            if (simpleTableCalcSelects.cte)
                ctesToAdd.push(simpleTableCalcSelects.cte);
            current = simpleTableCalcSelects.next;

            // Add dependent table calc CTEs
            const dep = this.buildDependentTableCalcCtes(current);
            if (dep.ctes.length) ctesToAdd.push(...dep.ctes);

            // final SELECT from the last CTE; inline simple calcs & metric filters only if we never created their CTEs
            const insertedSimpleInline =
                current === metricsCteName &&
                MetricQueryBuilder.hasSimpleTableCalcs(
                    tableCalculationSQL.selects,
                );
            const finalSelectColumns = [
                '  *',
                ...(current === metricsCteName
                    ? tableCalculationSQL.selects
                    : []),
            ];

            const combinedWhere = MetricQueryBuilder.combineWhereClauses(
                // Apply metric filters if we didn't create a metric_filters CTE
                !metricFilters.cte ? metricsSQL.filtersSQL : undefined,
                // Table calc filters always apply at the end
                tableCalculationSQL.filtersSQL,
            );

            const finalFromName = dep.lastName; // last dependent CTE if any, otherwise `current`
            finalSelectParts = [
                `SELECT\n${finalSelectColumns.join(',\n')}`,
                `FROM ${finalFromName}`,
                combinedWhere,
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
