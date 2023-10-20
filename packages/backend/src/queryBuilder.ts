import {
    assertUnreachable,
    BinType,
    CompiledDimension,
    CompiledMetricQuery,
    DbtModelJoinType,
    Explore,
    fieldId,
    FieldId,
    FieldReferenceError,
    FieldType,
    FilterGroup,
    FilterRule,
    ForbiddenError,
    getCustomDimensionId,
    getCustomMetricDimensionId,
    getDimensions,
    getFilterRulesFromGroup,
    getMetrics,
    isAndFilterGroup,
    isFilterGroup,
    parseAllReferences,
    renderFilterRuleSql,
    SupportedDbtAdapter,
    UserAttributeValueMap,
    WarehouseClient,
} from '@lightdash/common';
import { hasUserAttribute } from './services/UserAttributesService/UserAttributeUtils';

const getDimensionFromId = (dimId: FieldId, explore: Explore) => {
    const dimensions = getDimensions(explore);
    const dimension = dimensions.find((d) => fieldId(d) === dimId);
    if (dimension === undefined)
        throw new FieldReferenceError(
            `Tried to reference dimension with unknown field id: ${dimId}`,
        );
    return dimension;
};

const getMetricFromId = (
    metricId: FieldId,
    explore: Explore,
    compiledMetricQuery: CompiledMetricQuery,
) => {
    const metrics = [
        ...getMetrics(explore),
        ...(compiledMetricQuery.compiledAdditionalMetrics || []),
    ];
    const metric = metrics.find((m) => fieldId(m) === metricId);
    if (metric === undefined)
        throw new FieldReferenceError(
            `Tried to reference metric with unknown field id: ${metricId}`,
        );
    return metric;
};

export const replaceUserAttributes = (
    sqlFilter: string,
    userAttributes: UserAttributeValueMap,
    stringQuoteChar: string = "'",
    filter: string = 'sql_filter',
): string => {
    const userAttributeRegex =
        /\$\{(?:lightdash|ld)\.(?:attribute|attributes|attr)\.(\w+)\}/g;
    const sqlAttributes = sqlFilter.match(userAttributeRegex);

    if (sqlAttributes === null || sqlAttributes.length === 0) {
        return sqlFilter;
    }

    return sqlAttributes.reduce<string>((acc, sqlAttribute) => {
        const attribute = sqlAttribute.replace(userAttributeRegex, '$1');
        const userValue: string | null | undefined = userAttributes[attribute];

        if (userValue === undefined) {
            throw new ForbiddenError(
                `Missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
            );
        }
        if (userValue === null) {
            throw new ForbiddenError(
                `Invalid or missing user attribute "${attribute}" on ${filter}: "${sqlFilter}"`,
            );
        }

        return acc.replace(
            sqlAttribute,
            `${stringQuoteChar}${userValue}${stringQuoteChar}`,
        );
    }, sqlFilter);
};

export const assertValidDimensionRequiredAttribute = (
    dimension: CompiledDimension,
    userAttributes: UserAttributeValueMap,
    field: string,
) => {
    // Throw error if user does not have the right requiredAttribute for this dimension
    if (dimension.requiredAttributes)
        Object.entries(dimension.requiredAttributes).map((attribute) => {
            const [attributeName, value] = attribute;
            if (!hasUserAttribute(userAttributes, attributeName, value)) {
                throw new ForbiddenError(
                    `Invalid or missing user attribute "${attribute}" on ${field}`,
                );
            }
            return undefined;
        });
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
    warehouseClient: WarehouseClient;
    userAttributes?: UserAttributeValueMap;
};

const getJoinType = (type: DbtModelJoinType = 'left') => {
    switch (type) {
        case 'inner':
            return 'INNER JOIN';
        case 'full':
            return 'FULL OUTER JOIN';
        case 'left':
            return 'LEFT OUTER JOIN';
        case 'right':
            return 'RIGHT OUTER JOIN';
        default:
            return assertUnreachable(type, `Unknown join type: ${type}`);
    }
};

export const buildQuery = ({
    explore,
    compiledMetricQuery,
    warehouseClient,
    userAttributes = {},
}: BuildQueryProps): { query: string; hasExampleMetric: boolean } => {
    let hasExampleMetric: boolean = false;
    const adapterType: SupportedDbtAdapter = warehouseClient.getAdapterType();
    const {
        dimensions,
        metrics,
        filters,
        sorts,
        limit,
        additionalMetrics,
        customDimensions,
    } = compiledMetricQuery;
    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const fieldQuoteChar = warehouseClient.getFieldQuoteChar();
    const stringQuoteChar = warehouseClient.getStringQuoteChar();
    const escapeStringQuoteChar = warehouseClient.getEscapeStringQuoteChar();
    const startOfWeek = warehouseClient.getStartOfWeek();

    const dimensionSelects = dimensions.map((field) => {
        const alias = field;
        const dimension = getDimensionFromId(field, explore);

        assertValidDimensionRequiredAttribute(
            dimension,
            userAttributes,
            `dimension: "${field}"`,
        );
        return `  ${dimension.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
    });

    const customDimensionCTEs =
        customDimensions?.map((customDimension) => {
            const dimension = getDimensionFromId(
                customDimension.dimensionId,
                explore,
            );
            return ` ${getCustomDimensionId(customDimension)}_cte AS (
            SELECT
                MIN(${dimension.compiledSql}) AS min_id,
                MAX(${dimension.compiledSql}) AS max_id
            FROM "postgres"."jaffle"."${customDimension.table}"
        )`;
        }) || [];
    const customDimensionCTE = customDimensionCTEs
        ? `WITH ${customDimensionCTEs.join(',\n')}`
        : ``;
    const customDimensionFrom =
        customDimensions?.map(
            (customDimension) => `${getCustomDimensionId(customDimension)}_cte`,
        ) || [];

    // TODO unify these 3 custom dimension in a single reduce
    const customDimensionSelects =
        customDimensions?.reduce<string[]>((acc, customDimension) => {
            const dimension = getDimensionFromId(
                customDimension.dimensionId,
                explore,
            );
            // Check required attribute permission for parent dimension
            assertValidDimensionRequiredAttribute(
                dimension,
                userAttributes,
                `custom dimension: "${customDimension.name}"`,
            );

            const customDimensionName = `${fieldQuoteChar}${getCustomDimensionId(
                customDimension,
            )}${fieldQuoteChar}`;
            const cte = `${getCustomDimensionId(customDimension)}_cte`;
            switch (customDimension.binType) {
                case BinType.FIXED_NUMBER:
                    // return `-- ${customDimensionName}  FROM ( SELECT ${dimension.compiledSql}, INTEGER(${dimension.compiledSql} / ${customDimension.binNumber}) AS  ${customDimensionName} FROM ${dimension.table} )`
                    //    return `APPROX_QUANTILES(${dimension.compiledSql}, ${customDimension.binNumber}) AS ${customDimensionName}`
                    if (!customDimension.binNumber) {
                        throw new Error(
                            `Undefined binNumber for custom dimension ${BinType.FIXED_NUMBER} `,
                        );
                    }

                    // TODO test this on other warehouses
                    const ratio = `${cte}.min_id + (${cte}.max_id - ${cte}.min_id )`;

                    const whens = Array.from(
                        Array(customDimension.binNumber - 1).keys(),
                    ).map((i) => {
                        const from = `${ratio} * ${i} / ${customDimension.binNumber}`;
                        const to = `${ratio} * ${i + 1} / ${
                            customDimension.binNumber
                        }`;
                        return `WHEN ${dimension.compiledSql} >= ${from} AND ${dimension.compiledSql} < ${to} THEN CONCAT(${from}, ' to ', ${to})`;
                    });
                    return [
                        ...acc,
                        `CASE
                        ${whens.join('\n')}
                        ELSE CONCAT(${ratio} * ${
                            customDimension.binNumber - 1
                        } / ${
                            customDimension.binNumber
                        }, ' to ', ${cte}.max_id) END
                        AS ${customDimensionName}
                    `,
                    ];

                /* return [...acc, `CASE 
                    WHEN ${dimension.compiledSql} >= ${cte}.min_id AND ${dimension.compiledSql} <  ${ratio} / 3 THEN ${1}
                    WHEN ${dimension.compiledSql} >= ${ratio} / 3 AND ${dimension.compiledSql} < ${ratio}* 2/3 THEN ${2}
                    ELSE 3 END
                    AS ${customDimensionName} `] */
                // return `  ntile(${customDimension.binNumber}) OVER (ORDER BY ${dimension.compiledSql}) AS ${customDimensionName}`;
                default:
                    assertUnreachable(
                        customDimension.binType,
                        `Unknown bin type: ${customDimension.binType}`,
                    );
            }
            return acc;
        }, []) || [];

    const froms = [
        `${baseTable} AS ${fieldQuoteChar}${explore.baseTable}${fieldQuoteChar}`,
        ...customDimensionFrom,
    ];
    const sqlFrom = `FROM ${froms.join(',')}`;

    const metricSelects = metrics.map((field) => {
        const alias = field;
        const metric = getMetricFromId(field, explore, compiledMetricQuery);
        if (metric.isAutoGenerated) {
            hasExampleMetric = true;
        }
        return `  ${metric.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
    });

    if (additionalMetrics)
        additionalMetrics.forEach((metric) => {
            if (
                metric.baseDimensionName === undefined ||
                !metrics.includes(`${metric.table}_${metric.name}`)
            )
                return;

            const dimensionId = getCustomMetricDimensionId(metric);
            const dimension = getDimensionFromId(dimensionId, explore);

            assertValidDimensionRequiredAttribute(
                dimension,
                userAttributes,
                `custom metric: "${metric.name}"`,
            );
        });
    const selectedTables = new Set<string>([
        ...metrics.reduce<string[]>((acc, field) => {
            const metric = getMetricFromId(field, explore, compiledMetricQuery);
            return [...acc, ...(metric.tablesReferences || [metric.table])];
        }, []),
        ...dimensions.reduce<string[]>((acc, field) => {
            const dim = getDimensionFromId(field, explore);
            return [...acc, ...(dim.tablesReferences || [dim.table])];
        }, []),
        ...getFilterRulesFromGroup(filters.dimensions).reduce<string[]>(
            (acc, filterRule) => {
                const dim = getDimensionFromId(
                    filterRule.target.fieldId,
                    explore,
                );
                return [...acc, ...(dim.tablesReferences || [dim.table])];
            },
            [],
        ),
        ...getFilterRulesFromGroup(filters.metrics).reduce<string[]>(
            (acc, filterRule) => {
                const metric = getMetricFromId(
                    filterRule.target.fieldId,
                    explore,
                    compiledMetricQuery,
                );
                return [...acc, ...(metric.tablesReferences || [metric.table])];
            },
            [],
        ),
    ]);

    const getJoinedTables = (tableNames: string[]): string[] => {
        if (tableNames.length === 0) {
            return [];
        }
        const allNewReferences = explore.joinedTables.reduce<string[]>(
            (sum, joinedTable) => {
                if (tableNames.includes(joinedTable.table)) {
                    const newReferencesInJoin = parseAllReferences(
                        joinedTable.sqlOn,
                        joinedTable.table,
                    ).reduce<string[]>(
                        (acc, { refTable }) =>
                            !tableNames.includes(refTable)
                                ? [...acc, refTable]
                                : acc,
                        [],
                    );
                    return [...sum, ...newReferencesInJoin];
                }
                return sum;
            },
            [],
        );
        return [...allNewReferences, ...getJoinedTables(allNewReferences)];
    };

    const joinedTables = new Set([
        ...selectedTables,
        ...getJoinedTables([...selectedTables]),
    ]);

    const sqlJoins = explore.joinedTables
        .filter((join) => joinedTables.has(join.table))
        .map((join) => {
            const joinTable = explore.tables[join.table].sqlTable;
            const joinType = getJoinType(join.type);

            const alias = join.table;
            const parsedSqlOn = replaceUserAttributes(
                join.compiledSqlOn,
                userAttributes,
                stringQuoteChar,
                'sql_on',
            );
            return `${joinType} ${joinTable} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}\n  ON ${parsedSqlOn}`;
        })
        .join('\n');

    const filteredMetricSelects = getFilterRulesFromGroup(
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

    const sqlSelect = `SELECT\n${[
        ...dimensionSelects,
        ...customDimensionSelects,
        ...metricSelects,
        ...filteredMetricSelects,
    ].join(',\n')}`;

    const groups = [
        ...(dimensionSelects.length > 0 ? dimensionSelects : []),
        ...(customDimensionSelects && customDimensionSelects.length > 0
            ? customDimensionSelects
            : []),
    ];
    const sqlGroupBy =
        groups.length > 0
            ? `GROUP BY ${groups.map((val, i) => i + 1).join(',')}`
            : '';

    const fieldOrders = sorts.map(
        (sort) =>
            `${fieldQuoteChar}${sort.fieldId}${fieldQuoteChar}${
                sort.descending ? ' DESC' : ''
            }`,
    );
    const sqlOrderBy =
        fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : '';

    const sqlFilterRule = (filter: FilterRule, fieldType: FieldType) => {
        const field =
            fieldType === FieldType.DIMENSION
                ? getDimensions(explore).find(
                      (d) => fieldId(d) === filter.target.fieldId,
                  )
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
        return renderFilterRuleSql(
            filter,
            field,
            fieldQuoteChar,
            stringQuoteChar,
            escapeStringQuoteChar,
            startOfWeek,
            adapterType,
        );
    };

    const getNestedFilterSQLFromGroup = (
        filterGroup: FilterGroup | undefined,
        fieldType: FieldType,
    ): string | undefined => {
        if (filterGroup) {
            const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
            const items = isAndFilterGroup(filterGroup)
                ? filterGroup.and
                : filterGroup.or;
            if (items.length === 0) return undefined;
            const filterRules: string[] = items.reduce<string[]>(
                (sum, item) => {
                    const filterSql: string | undefined = isFilterGroup(item)
                        ? getNestedFilterSQLFromGroup(item, fieldType)
                        : `(\n  ${sqlFilterRule(item, fieldType)}\n)`;
                    return filterSql ? [...sum, filterSql] : sum;
                },
                [],
            );
            return filterRules.length > 0
                ? `(${filterRules.join(` ${operator} `)})`
                : undefined;
        }
        return undefined;
    };

    const baseTableSqlWhere = explore.tables[explore.baseTable].sqlWhere;

    const tableSqlWhere = baseTableSqlWhere
        ? [
              replaceUserAttributes(
                  baseTableSqlWhere,
                  userAttributes,
                  stringQuoteChar,
              ),
          ]
        : [];

    const nestedFilterSql = getNestedFilterSQLFromGroup(
        filters.dimensions,
        FieldType.DIMENSION,
    );
    const nestedFilterWhere = nestedFilterSql ? [nestedFilterSql] : [];
    const allSqlFilters = [...tableSqlWhere, ...nestedFilterWhere];
    const sqlWhere =
        allSqlFilters.length > 0 ? `WHERE ${allSqlFilters.join(' AND ')}` : '';

    const whereMetricFilters = getNestedFilterSQLFromGroup(
        filters.metrics,
        FieldType.METRIC,
    );
    const sqlLimit = `LIMIT ${limit}`;

    if (
        compiledMetricQuery.compiledTableCalculations.length > 0 ||
        whereMetricFilters
    ) {
        const cteSql = [
            sqlSelect,
            sqlFrom,
            sqlJoins,
            sqlWhere,
            sqlGroupBy,
        ].join('\n');
        const cteName = 'metrics';
        const ctes = [...customDimensionCTEs, `${cteName} AS (\n${cteSql})`];
        const cte = `WITH ${ctes.join(',\n')}`;
        const tableCalculationSelects =
            compiledMetricQuery.compiledTableCalculations.map(
                (tableCalculation) => {
                    const alias = tableCalculation.name;
                    return `  ${tableCalculation.compiledSql} AS ${fieldQuoteChar}${alias}${fieldQuoteChar}`;
                },
            );
        const finalSelect = `SELECT\n${['  *', ...tableCalculationSelects].join(
            ',\n',
        )}`;
        const finalFrom = `FROM ${cteName}`;
        const finalSqlWhere = whereMetricFilters
            ? `WHERE ${whereMetricFilters}`
            : '';
        const secondQuery = [finalSelect, finalFrom, finalSqlWhere].join('\n');

        return {
            query: [cte, secondQuery, sqlOrderBy, sqlLimit].join('\n'),
            hasExampleMetric,
        };
    }

    const metricQuerySql = [
        customDimensionCTE,
        sqlSelect,
        sqlFrom,
        sqlJoins,
        sqlWhere,
        sqlGroupBy,
        sqlOrderBy,
        sqlLimit,
    ].join('\n');

    return {
        query: metricQuerySql,
        hasExampleMetric,
    };
};
