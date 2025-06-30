import {
    CompiledDimension,
    CompiledMetricQuery,
    CompiledTable,
    createFilterRuleFromModelRequiredFilterRule,
    DimensionType,
    Explore,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    getCustomMetricDimensionId,
    getDimensions,
    getFieldQuoteChar,
    getFieldsFromMetricQuery,
    getFilterRulesFromGroup,
    getItemId,
    IntrinsicUserAttributes,
    isAndFilterGroup,
    isCompiledCustomSqlDimension,
    isCustomBinDimension,
    isFilterGroup,
    isFilterRuleInQuery,
    isJoinModelRequiredFilter,
    ItemsMap,
    MetricFilterRule,
    parseAllReferences,
    QueryWarning,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    renderTableCalculationFilterRuleSql,
    SupportedDbtAdapter,
    TimeFrames,
    UserAttributeValueMap,
    WarehouseClient,
    WeekDay,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import {
    assertValidDimensionRequiredAttribute,
    findMetricInflationWarnings,
    getCustomBinDimensionSql,
    getCustomSqlDimensionSql,
    getDimensionFromFilterTargetId,
    getDimensionFromId,
    getJoinedTables,
    getJoinType,
    getMetricFromId,
    replaceUserAttributesAsStrings,
    replaceUserAttributesRaw,
    sortDayOfWeekName,
    sortMonthName,
} from './utils';

export type CompiledQuery = {
    query: string;
    fields: ItemsMap;
    warnings: QueryWarning[];
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    warehouseClient: WarehouseClient;
    userAttributes?: UserAttributeValueMap;
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
            warehouseClient,
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
                      warehouseClient,
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
        selects: string[];
        groupBySQL: string | undefined;
        filtersSQL: string | undefined;
    } {
        const {
            explore,
            compiledMetricQuery,
            warehouseClient,
            userAttributes = {},
            intrinsicUserAttributes,
        } = this.args;
        const adapterType: SupportedDbtAdapter =
            warehouseClient.getAdapterType();
        const { dimensions, sorts, compiledCustomDimensions, filters } =
            compiledMetricQuery;
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
        const startOfWeek = warehouseClient.getStartOfWeek();
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
            warehouseClient,
            explore,
            customDimensions:
                selectedCustomDimensions?.filter(isCustomBinDimension),
            intrinsicUserAttributes,
            userAttributes,
            sorts,
        });
        const customSqlDimensionSql = getCustomSqlDimensionSql({
            warehouseClient,
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
        const selects = dimensionsObjects.map(
            (dimension) =>
                `  ${dimension.compiledSql} AS ${fieldQuoteChar}${getItemId(
                    dimension,
                )}${fieldQuoteChar}`,
        );
        if (customBinDimensionSql?.selects) {
            selects.push(...customBinDimensionSql.selects);
        }
        if (customSqlDimensionSql?.selects) {
            selects.push(...customSqlDimensionSql.selects);
        }
        const groupBySQL =
            selects.length > 0
                ? `GROUP BY ${selects.map((val, i) => i + 1).join(',')}`
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
            warehouseClient,
            userAttributes = {},
        } = this.args;
        const { metrics, filters, additionalMetrics } = compiledMetricQuery;
        const adapterType: SupportedDbtAdapter =
            warehouseClient.getAdapterType();
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
        const startOfWeek = warehouseClient.getStartOfWeek();

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

    private getTableCalculationsSQL(): {
        selects: string[];
        filtersSQL: string | undefined;
    } {
        const { compiledMetricQuery, warehouseClient } = this.args;
        const { filters } = compiledMetricQuery;
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );

        // Selects
        const selects = compiledMetricQuery.compiledTableCalculations.map(
            (tableCalculation) => {
                const alias = tableCalculation.name;
                return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
            },
        );

        // Filters
        const tableCalculationFilters = this.getNestedFilterSQLFromGroup(
            filters.tableCalculations,
        );

        return {
            selects,
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
        const { explore, compiledMetricQuery, warehouseClient, timezone } =
            this.args;
        const adapterType: SupportedDbtAdapter =
            warehouseClient.getAdapterType();
        const { compiledCustomDimensions } = compiledMetricQuery;
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
        const stringQuoteChar = warehouseClient.getStringQuoteChar();
        const escapeStringQuoteChar =
            warehouseClient.getEscapeStringQuoteChar();
        const startOfWeek = warehouseClient.getStartOfWeek();

        if (!fieldType) {
            const field = compiledMetricQuery.compiledTableCalculations?.find(
                (tc) => getItemId(tc) === filter.target.fieldId,
            );
            return renderTableCalculationFilterRuleSql(
                filter,
                field,
                fieldQuoteChar,
                stringQuoteChar,
                escapeStringQuoteChar,
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
                  ].find((d) => getItemId(d) === filter.target.fieldId)
                : getMetricFromId(
                      filter.target.fieldId,
                      explore,
                      compiledMetricQuery,
                  );
        if (!field) {
            throw new FieldReferenceError(
                `Filter has a reference to an unknown ${fieldType}: ${filter.target.fieldId}`,
            );
        }

        return renderFilterRuleSqlFromField(
            filter,
            field,
            fieldQuoteChar,
            stringQuoteChar,
            escapeStringQuoteChar,
            startOfWeek,
            adapterType,
            timezone,
        );
    }

    private getSortSQL() {
        const { explore, compiledMetricQuery, warehouseClient } = this.args;
        const { sorts, compiledCustomDimensions } = compiledMetricQuery;
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
        const startOfWeek = warehouseClient.getStartOfWeek();
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
                }_order${fieldQuoteChar}${sort.descending ? ' DESC' : ''}`;
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
                    getFieldQuoteChar(warehouseClient.credentials.type),
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
                    getFieldQuoteChar(warehouseClient.credentials.type),
                    sort.descending,
                );
            }
            return `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }`;
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
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes = {},
        } = this.args;
        const baseTable = replaceUserAttributesRaw(
            explore.tables[explore.baseTable].sqlTable,
            intrinsicUserAttributes,
            userAttributes,
        );
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );
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
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes = {},
        } = this.args;
        const fieldQuoteChar = getFieldQuoteChar(
            warehouseClient.credentials.type,
        );

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
                    warehouseClient,
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
        const joins = this.getJoinsSQL({
            tablesReferencedInDimensions: dimensionsSQL.tables,
            tablesReferencedInMetrics: metricsSQL.tables,
        });
        const warnings = this.getWarnings({ joinedTables: joins.tables });

        const sqlSelect = `SELECT\n${[
            ...dimensionsSQL.selects,
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
        if (
            tableCalculationSQL.selects.length > 0 ||
            metricsSQL.filtersSQL ||
            requiresQueryInCTE
        ) {
            // Move latest select to CTE and define new final select with table calculations and metric filters
            const cteName = 'metrics';
            ctes.push(
                `${cteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                    finalSelectParts,
                )}\n)`,
            );
            finalSelectParts = [
                `SELECT\n${['  *', ...tableCalculationSQL.selects].join(
                    ',\n',
                )}`,
                `FROM ${cteName}`,
                metricsSQL.filtersSQL,
            ];
            if (tableCalculationSQL.filtersSQL) {
                // Move latest select to CTE and define new final select with table calculation filters
                const queryResultCteName = 'table_calculations';
                ctes.push(
                    `${queryResultCteName} AS (\n${MetricQueryBuilder.assembleSqlParts(
                        finalSelectParts,
                    )}\n)`,
                );
                finalSelectParts = [
                    'SELECT *',
                    `FROM ${queryResultCteName}`,
                    tableCalculationSQL.filtersSQL,
                ];
            }
        }

        return {
            query: MetricQueryBuilder.assembleSqlParts([
                MetricQueryBuilder.buildCtesSQL(ctes),
                ...finalSelectParts,
                sqlOrderBy,
                sqlLimit,
            ]),
            fields,
            warnings,
        };
    }
}

type ReferenceObject = { type: DimensionType; sql: string };
export type ReferenceMap = Record<string, ReferenceObject> | undefined;
type From = { name: string; sql?: string };

export class QueryBuilder {
    // Column references, to be used in select, filters, etc
    private readonly referenceMap: ReferenceMap;

    // Select values are references
    private readonly select: string[];

    private readonly from: From;

    private readonly filters: FilterGroup | undefined;

    constructor(
        args: {
            referenceMap: ReferenceMap;
            select: string[];
            from: From;
            filters?: FilterGroup;
        },
        private config: {
            fieldQuoteChar: string;
            stringQuoteChar: string;
            escapeStringQuoteChar: string;
            startOfWeek: WeekDay | null | undefined;
            adapterType: SupportedDbtAdapter;
            timezone?: string;
        },
    ) {
        this.select = args.select;
        this.from = args.from;
        this.filters = args.filters;
        this.referenceMap = args.referenceMap;
    }

    private quotedName(value: string) {
        return `${this.config.fieldQuoteChar}${value}${this.config.fieldQuoteChar}`;
    }

    private getReference(reference: string): ReferenceObject {
        const referenceObject = this.referenceMap?.[reference];
        if (!referenceObject) {
            throw new FieldReferenceError(`Unknown reference: ${reference}`);
        }
        return referenceObject;
    }

    private selectsToSql(): string | undefined {
        let selectSQL = '*';
        if (this.select.length > 0) {
            selectSQL = this.select
                .map((reference) => {
                    const referenceObject = this.getReference(reference);
                    return `${referenceObject.sql} AS ${this.quotedName(
                        reference,
                    )}`;
                })
                .join(',\n');
        }
        return `SELECT\n${selectSQL}`;
    }

    private fromToSql(): string {
        return `FROM ${
            this.from.sql ? `(\n${this.from.sql}\n) AS ` : ''
        }${this.quotedName(this.from.name)}`;
    }

    private filtersToSql() {
        // Recursive function to convert filters to SQL
        const getNestedFilterSQLFromGroup = (
            filterGroup: FilterGroup | undefined,
        ): string | undefined => {
            if (filterGroup) {
                const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
                const items = isAndFilterGroup(filterGroup)
                    ? filterGroup.and
                    : filterGroup.or;
                if (items.length === 0) return undefined;
                const filterRules: string[] = items.reduce<string[]>(
                    (sum, item) => {
                        // Handle nested filters
                        if (isFilterGroup(item)) {
                            const nestedFilterSql =
                                getNestedFilterSQLFromGroup(item);
                            return nestedFilterSql
                                ? [...sum, nestedFilterSql]
                                : sum;
                        }
                        // Handle filter rule
                        const reference = this.getReference(
                            item.target.fieldId,
                        );
                        const filterSQl = `(\n${renderFilterRuleSql(
                            item,
                            reference.type,
                            reference.sql,
                            this.config.stringQuoteChar,
                            this.config.escapeStringQuoteChar,
                            this.config.startOfWeek,
                            this.config.adapterType,
                            this.config.timezone,
                        )}\n)`;
                        return [...sum, filterSQl];
                    },
                    [],
                );
                return filterRules.length > 0
                    ? `(${filterRules.join(` ${operator} `)})`
                    : undefined;
            }
            return undefined;
        };

        const filtersSql = getNestedFilterSQLFromGroup(this.filters);
        if (filtersSql) {
            return `WHERE ${filtersSql}`;
        }
        return undefined;
    }

    toSql(): string {
        // Combine all parts of the query
        return [this.selectsToSql(), this.fromToSql(), this.filtersToSql()]
            .filter((l) => l !== undefined)
            .join('\n');
    }
}
