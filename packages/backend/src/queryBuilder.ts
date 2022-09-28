import {
    CompiledField,
    CompiledMetricQuery,
    DateFilterRule,
    DimensionType,
    Explore,
    fieldId,
    FieldId,
    FilterGroup,
    FilterOperator,
    FilterRule,
    formatDate,
    getDimensions,
    getFields,
    getFilterRulesFromGroup,
    getMetrics,
    getQuoteChar,
    isAndFilterGroup,
    isFilterGroup,
    isMetric,
    MetricType,
    parseAllReferences,
    UnitOfTime,
    unitOfTimeFormat,
} from '@lightdash/common';
import moment from 'moment';

const formatTimestamp = (date: Date): string =>
    moment(date).format('YYYY-MM-DD HH:mm:ss');

const renderStringFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${filter.values
                      .map((v) => `'${v}'`)
                      .join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${filter.values
                      .map((v) => `'${v}'`)
                      .join(',')})`;
        case FilterOperator.INCLUDE:
            return `LOWER(${dimensionSql}) LIKE LOWER('%${
                filter.values?.[0] || ''
            }%')`;
        case FilterOperator.NOT_INCLUDE:
            return `LOWER(${dimensionSql}) NOT LIKE LOWER('%${
                filter.values?.[0] || ''
            }%')`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.STARTS_WITH:
            return `(${dimensionSql}) LIKE '${filter.values?.[0] || ''}%'`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of string type`,
            );
    }
};

const renderNumberFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${filter.values.join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${filter.values.join(',')})`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return `(${dimensionSql}) > (${filter.values?.[0] || 0})`;
        case FilterOperator.LESS_THAN:
            return `(${dimensionSql}) < (${filter.values?.[0] || 0})`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of number type`,
            );
    }
};

export const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    dateFormatter: (date: Date) => string = formatDate,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'notEquals':
            return `(${dimensionSql}) != ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'greaterThan':
            return `(${dimensionSql}) > ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'greaterThanOrEqual':
            return `(${dimensionSql}) >= ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'lessThan':
            return `(${dimensionSql}) < ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'lessThanOrEqual':
            return `(${dimensionSql}) <= ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case FilterOperator.IN_THE_PAST:
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const completedDate = moment(
                    moment()
                        .startOf(unitOfTime)
                        .format(unitOfTimeFormat[unitOfTime]),
                ).toDate();
                const untilDate = dateFormatter(
                    moment().startOf(unitOfTime).toDate(),
                );
                return `((${dimensionSql}) >= ('${dateFormatter(
                    moment(completedDate)
                        .subtract(filter.values?.[0], unitOfTime)
                        .toDate(),
                )}') AND (${dimensionSql}) < ('${untilDate}'))`;
            }
            const untilDate = dateFormatter(moment().toDate());
            return `((${dimensionSql}) >= ('${dateFormatter(
                moment().subtract(filter.values?.[0], unitOfTime).toDate(),
            )}') AND (${dimensionSql}) <= ('${untilDate}'))`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of date type`,
            );
    }
};

const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
): string => {
    const { operator } = filter;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${!!filter.values?.[0]}`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${operator} on dimension of boolean type`,
            );
    }
};

const renderFilterRuleSql = (
    filterRule: FilterRule,
    field: CompiledField,
    quoteChar: string,
): string => {
    const fieldType = field.type;
    const fieldSql = isMetric(field)
        ? `${quoteChar}${filterRule.target.fieldId}${quoteChar}`
        : field.compiledSql;

    switch (field.type) {
        case DimensionType.STRING:
        case MetricType.STRING: {
            return renderStringFilterSql(fieldSql, filterRule);
        }
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX: {
            return renderNumberFilterSql(fieldSql, filterRule);
        }
        case DimensionType.DATE:
        case MetricType.DATE: {
            return renderDateFilterSql(fieldSql, filterRule);
        }
        case DimensionType.TIMESTAMP: {
            return renderDateFilterSql(fieldSql, filterRule, formatTimestamp);
        }
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN: {
            return renderBooleanFilterSql(fieldSql, filterRule);
        }
        default: {
            const nope: never = field;
            throw Error(
                `No function implemented to render sql for filter group type ${fieldType}`,
            );
        }
    }
};

const getDimensionFromId = (dimId: FieldId, explore: Explore) => {
    const dimensions = getDimensions(explore);
    const dimension = dimensions.find((d) => fieldId(d) === dimId);
    if (dimension === undefined)
        throw new Error(
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
        throw new Error(
            `Tried to reference metric with unknown field id ${metricId}`,
        );
    return metric;
};

const getOperatorSql = (filterGroup: FilterGroup | undefined) => {
    if (filterGroup) {
        return isAndFilterGroup(filterGroup) ? ' AND ' : ' OR ';
    }
    return ' AND ';
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
};
export const buildQuery = ({
    explore,
    compiledMetricQuery,
}: BuildQueryProps): { query: string; hasExampleMetric: boolean } => {
    let hasExampleMetric: boolean = false;
    const { dimensions, metrics, filters, sorts, limit } = compiledMetricQuery;
    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const q = getQuoteChar(explore.targetDatabase); // quote char
    const sqlFrom = `FROM ${baseTable} AS ${q}${explore.baseTable}${q}`;

    const dimensionSelects = dimensions.map((field) => {
        const alias = field;
        const dimension = getDimensionFromId(field, explore);
        return `  ${dimension.compiledSql} AS ${q}${alias}${q}`;
    });

    const metricSelects = metrics.map((field) => {
        const alias = field;
        const metric = getMetricFromId(field, explore, compiledMetricQuery);
        if (metric.isAutoGenerated) {
            hasExampleMetric = true;
        }
        return `  ${metric.compiledSql} AS ${q}${alias}${q}`;
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
            const alias = join.table;
            return `LEFT JOIN ${joinTable} AS ${q}${alias}${q}\n  ON ${join.compiledSqlOn}`;
        })
        .join('\n');

    const sqlSelect = `SELECT\n${[...dimensionSelects, ...metricSelects].join(
        ',\n',
    )}`;
    const sqlGroupBy =
        dimensionSelects.length > 0
            ? `GROUP BY ${dimensionSelects.map((val, i) => i + 1).join(',')}`
            : '';

    const fieldOrders = sorts.map(
        (sort) => `${q}${sort.fieldId}${q}${sort.descending ? ' DESC' : ''}`,
    );
    const sqlOrderBy =
        fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : '';

    const sqlFilterRule = (filter: FilterRule) => {
        const field = getFields(explore).find(
            (d) => fieldId(d) === filter.target.fieldId,
        );
        if (!field) {
            throw new Error(
                `Filter has a reference to an unknown dimension: ${filter.target.fieldId}`,
            );
        }
        return renderFilterRuleSql(filter, field, q);
    };

    const getNestedFilterSQLFromGroup = (
        filterGroup: FilterGroup | undefined,
    ): string => {
        if (filterGroup) {
            const operator = isAndFilterGroup(filterGroup) ? 'AND' : 'OR';
            const items = isAndFilterGroup(filterGroup)
                ? filterGroup.and
                : filterGroup.or;
            if (items.length === 0) return '';
            const filterRules = items.reduce((sum, item) => {
                const filterSql = isFilterGroup(item)
                    ? getNestedFilterSQLFromGroup(item)
                    : `(\n  ${sqlFilterRule(item)}\n)`;
                return [...sum, filterSql];
            }, [] as string[]);
            return `(${filterRules.join(` ${operator} `)})`;
        }
        return `${filterGroup}`;
    };

    const nestedFilterSql = getNestedFilterSQLFromGroup(filters.dimensions);
    const sqlWhere =
        filters.dimensions !== undefined && nestedFilterSql
            ? `WHERE ${nestedFilterSql}`
            : '';

    const whereMetricFilters = getFilterRulesFromGroup(filters.metrics).map(
        (filter) => {
            const field = getMetricFromId(
                filter.target.fieldId,
                explore,
                compiledMetricQuery,
            );
            if (!field) {
                throw new Error(
                    `Filter has a reference to an unknown metric: ${filter.target.fieldId}`,
                );
            }
            return renderFilterRuleSql(filter, field, q);
        },
    );

    const sqlLimit = `LIMIT ${limit}`;

    if (
        compiledMetricQuery.compiledTableCalculations.length > 0 ||
        whereMetricFilters.length > 0
    ) {
        const cteSql = [
            sqlSelect,
            sqlFrom,
            sqlJoins,
            sqlWhere,
            sqlGroupBy,
        ].join('\n');
        const cteName = 'metrics';
        const cte = `WITH ${cteName} AS (\n${cteSql}\n)`;
        const tableCalculationSelects =
            compiledMetricQuery.compiledTableCalculations.map(
                (tableCalculation) => {
                    const alias = tableCalculation.name;
                    return `  ${tableCalculation.compiledSql} AS ${q}${alias}${q}`;
                },
            );
        const finalSelect = `SELECT\n${['  *', ...tableCalculationSelects].join(
            ',\n',
        )}`;
        const finalFrom = `FROM ${cteName}`;
        const finalSqlWhere =
            whereMetricFilters.length > 0
                ? `WHERE ${whereMetricFilters
                      .map((w) => `(\n  ${w}\n)`)
                      .join(getOperatorSql(filters.metrics))}`
                : '';
        const secondQuery = [finalSelect, finalFrom, finalSqlWhere].join('\n');

        return {
            query: [cte, secondQuery, sqlOrderBy, sqlLimit].join('\n'),
            hasExampleMetric,
        };
    }

    const metricQuerySql = [
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
