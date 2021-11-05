import {
    BooleanFilter,
    CompiledMetricQuery,
    DateAndTimestampFilter,
    Explore,
    fieldId,
    FieldId,
    fieldIdFromFilterGroup,
    FilterGroup,
    FilterGroupOperator,
    formatDate,
    formatTimestamp,
    getDimensions,
    getMetrics,
    NumberFilter,
    StringFilter,
    SupportedDbtAdapter,
} from 'common';

const renderStringFilterSql = (
    dimensionSql: string,
    filter: StringFilter,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return filter.values.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${filter.values
                      .map((v) => `'${v}'`)
                      .join(',')})`;
        case 'notEquals':
            return filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${filter.values
                      .map((v) => `'${v}'`)
                      .join(',')})`;
        case 'doesNotInclude':
            return `(${dimensionSql}) NOT LIKE '%${filter.value}%'`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'startsWith':
            return `(${dimensionSql}) LIKE '${filter.value}%'`;
        default:
            const nope: never = filter;
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of number type`,
            );
    }
};

const renderNumberFilterSql = (
    dimensionSql: string,
    filter: NumberFilter,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return filter.values.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${filter.values.join(',')})`;
        case 'notEquals':
            return filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${filter.values.join(',')})`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'greaterThan':
            return `(${dimensionSql}) > ${filter.value}`;
        case 'lessThan':
            return `(${dimensionSql}) < ${filter.value}`;
        default:
            const nope: never = filter;
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of string type`,
            );
    }
};

const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateAndTimestampFilter,
    dateFormatter = formatDate,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ('${dateFormatter(filter.value)}')`;
        case 'notEquals':
            return `(${dimensionSql}) != ('${dateFormatter(filter.value)}')`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'greaterThan':
            return `(${dimensionSql}) > ('${dateFormatter(filter.value)}')`;
        case 'greaterThanOrEqual':
            return `(${dimensionSql}) >= ('${dateFormatter(filter.value)}')`;
        case 'lessThan':
            return `(${dimensionSql}) < ('${dateFormatter(filter.value)}')`;
        case 'lessThanOrEqual':
            return `(${dimensionSql}) <= ('${dateFormatter(filter.value)}')`;
        default:
            const nope: never = filter;
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of string type`,
            );
    }
};

const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: BooleanFilter,
): string => {
    const { operator } = filter;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${filter.value}`;
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

const renderFilterGroupSql = (
    filterGroup: FilterGroup,
    explore: Explore,
): string => {
    const operator =
        filterGroup.operator === FilterGroupOperator.or ? 'OR' : 'AND';
    const groupType = filterGroup.type;
    const filterGroupFieldId = fieldIdFromFilterGroup(filterGroup);
    const dimension = getDimensions(explore).find(
        (d) => fieldId(d) === filterGroupFieldId,
    );
    switch (filterGroup.type) {
        case 'string': {
            if (dimension?.type === 'string')
                return filterGroup.filters
                    .map((filter) =>
                        renderStringFilterSql(dimension.compiledSql, filter),
                    )
                    .join(`\n   ${operator} `);
            throw new Error(
                `StringFilterGroup has a reference to an unknown string field ${fieldIdFromFilterGroup(
                    filterGroup,
                )}`,
            );
        }
        case 'number':
            if (dimension?.type === 'number')
                return filterGroup.filters
                    .map((filter) =>
                        renderNumberFilterSql(dimension.compiledSql, filter),
                    )
                    .join(`\n   ${operator} `);
            throw new Error(
                `NumberFilterGroup has a reference to an unknown number field ${fieldIdFromFilterGroup(
                    filterGroup,
                )}`,
            );
        case 'date':
            if (dimension?.type === 'date') {
                return filterGroup.filters
                    .map((filter) =>
                        renderDateFilterSql(dimension.compiledSql, filter),
                    )
                    .join(`\n   ${operator} `);
            }
            throw new Error(
                `DateFilterGroup has a reference to an unknown date field ${fieldIdFromFilterGroup(
                    filterGroup,
                )}`,
            );
        case 'timestamp':
            if (dimension?.type === 'timestamp') {
                return filterGroup.filters
                    .map((filter) =>
                        renderDateFilterSql(
                            dimension.compiledSql,
                            filter,
                            formatTimestamp,
                        ),
                    )
                    .join(`\n   ${operator} `);
            }
            throw new Error(
                `DateFilterGroup has a reference to an unknown date field ${fieldIdFromFilterGroup(
                    filterGroup,
                )}`,
            );
        case 'boolean':
            if (dimension?.type === 'boolean') {
                return filterGroup.filters
                    .map((filter) =>
                        renderBooleanFilterSql(dimension.compiledSql, filter),
                    )
                    .join(`\n   ${operator} `);
            }
            throw new Error(
                `DateFilterGroup has a reference to an unknown date field ${fieldIdFromFilterGroup(
                    filterGroup,
                )}`,
            );
        default:
            const nope: never = filterGroup;
            throw Error(
                `No function implemented to render sql for filter group type ${groupType}`,
            );
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

const getMetricFromId = (metricId: FieldId, explore: Explore) => {
    const metrics = getMetrics(explore);
    const metric = metrics.find((m) => fieldId(m) === metricId);
    if (metric === undefined)
        throw new Error(
            `Tried to reference metric with unknown field id ${metricId}`,
        );
    return metric;
};

export const getQuoteChar = (targetDatabase: SupportedDbtAdapter): string => {
    switch (targetDatabase) {
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
            return '"';
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.SPARK:
            return '`';
        default:
            return '"';
    }
};

export type BuildQueryProps = {
    explore: Explore;
    compiledMetricQuery: CompiledMetricQuery;
};
export const buildQuery = ({
    explore,
    compiledMetricQuery,
}: BuildQueryProps) => {
    const { dimensions, metrics, filters, sorts, limit } = compiledMetricQuery;
    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const sqlFrom = `FROM ${baseTable} AS ${explore.baseTable}`;
    const q = getQuoteChar(explore.targetDatabase); // quote char

    const sqlJoins = explore.joinedTables
        .map((join) => {
            const joinTable = explore.tables[join.table].sqlTable;
            const alias = join.table;
            return `LEFT JOIN ${joinTable} AS ${alias}\n  ON ${join.compiledSqlOn}`;
        })
        .join('\n');

    const dimensionSelects = dimensions.map((field) => {
        const alias = field;
        const dimension = getDimensionFromId(field, explore);
        return `  ${dimension.compiledSql} AS ${q}${alias}${q}`;
    });

    const metricSelects = metrics.map((field) => {
        const alias = field;
        const metric = getMetricFromId(field, explore);
        return `  ${metric.compiledSql} AS ${q}${alias}${q}`;
    });

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

    const whereFilters = filters.map((filter) =>
        renderFilterGroupSql(filter, explore),
    );
    const sqlWhere =
        whereFilters.length > 0
            ? `WHERE ${whereFilters.map((w) => `(\n  ${w}\n)`).join(' AND ')}`
            : '';

    const sqlLimit = `LIMIT ${limit}`;

    if (compiledMetricQuery.compiledTableCalculations.length > 0) {
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
                    return `${tableCalculation.compiledSql} AS ${q}${alias}${q}`;
                },
            );
        const finalSelect = `SELECT\n  *,\n  ${tableCalculationSelects.join(
            ',\n  ',
        )}`;
        const finalFrom = `FROM ${cteName}`;
        return [cte, finalSelect, finalFrom, sqlOrderBy, sqlLimit].join('\n');
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
    return metricQuerySql;
};
