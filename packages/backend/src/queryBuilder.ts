import {
    CompiledMetricQuery,
    DimensionType,
    Explore,
    fieldId,
    FieldId,
    FilterOperator,
    FilterRule,
    formatDate,
    formatTimestamp,
    getDimensions,
    getFilterRulesFromGroup,
    getMetrics,
    getTotalFilterRules,
    isAndFilterGroup,
    SupportedDbtAdapter,
} from 'common';

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
        case FilterOperator.NOT_INCLUDE:
            return `(${dimensionSql}) NOT LIKE '%${filter.values?.[0]}%'`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.STARTS_WITH:
            return `(${dimensionSql}) LIKE '${filter.values?.[0]}%'`;
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
            return `(${dimensionSql}) > ${filter.values?.[0]}`;
        case FilterOperator.LESS_THAN:
            return `(${dimensionSql}) < ${filter.values?.[0]}`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of number type`,
            );
    }
};

const renderDateFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
    dateFormatter = formatDate,
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

const renderFilterGroupSql = (
    filterRule: FilterRule,
    explore: Explore,
): string => {
    const filterGroupFieldId = filterRule.target.fieldId;
    const dimension = getDimensions(explore).find(
        (d) => fieldId(d) === filterGroupFieldId,
    );
    if (!dimension) {
        throw new Error(
            `Filter has a reference to an unknown field: ${filterGroupFieldId}`,
        );
    }
    switch (dimension.type) {
        case DimensionType.STRING: {
            return renderStringFilterSql(dimension.compiledSql, filterRule);
        }
        case DimensionType.NUMBER: {
            return renderNumberFilterSql(dimension.compiledSql, filterRule);
        }
        case DimensionType.DATE: {
            return renderDateFilterSql(dimension.compiledSql, filterRule);
        }
        case DimensionType.TIMESTAMP: {
            return renderDateFilterSql(
                dimension.compiledSql,
                filterRule,
                formatTimestamp,
            );
        }
        case DimensionType.BOOLEAN: {
            return renderBooleanFilterSql(dimension.compiledSql, filterRule);
        }
        default:
            const nope: never = dimension.type;
            throw Error(
                `No function implemented to render sql for filter group type ${dimension.type}`,
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
        case SupportedDbtAdapter.DATABRICKS:
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
}: BuildQueryProps): { query: string; hasExampleMetric: boolean } => {
    let hasExampleMetric: boolean = false;
    const { dimensions, metrics, filters, sorts, limit } = compiledMetricQuery;
    const baseTable = explore.tables[explore.baseTable].sqlTable;
    const sqlFrom = `FROM ${baseTable} AS ${explore.baseTable}`;
    const q = getQuoteChar(explore.targetDatabase); // quote char

    const dimensionSelects = dimensions.map((field) => {
        const alias = field;
        const dimension = getDimensionFromId(field, explore);
        return `  ${dimension.compiledSql} AS ${q}${alias}${q}`;
    });

    const metricSelects = metrics.map((field) => {
        const alias = field;
        const metric = getMetricFromId(field, explore);
        if (metric.isAutoGenerated) {
            hasExampleMetric = true;
        }
        return `  ${metric.compiledSql} AS ${q}${alias}${q}`;
    });

    const selectedTables = new Set([
        ...metrics.map((field) => getMetricFromId(field, explore).table),
        ...dimensions.map((field) => getDimensionFromId(field, explore).table),
        ...getTotalFilterRules(filters).map(
            (filterRule) =>
                getDimensionFromId(filterRule.target.fieldId, explore).table,
        ),
    ]);

    const sqlJoins = explore.joinedTables
        .filter((join) => selectedTables.has(join.table))
        .map((join) => {
            const joinTable = explore.tables[join.table].sqlTable;
            const alias = join.table;
            return `LEFT JOIN ${joinTable} AS ${alias}\n  ON ${join.compiledSqlOn}`;
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

    const whereFilters = (
        filters.dimensions && isAndFilterGroup(filters.dimensions)
            ? getFilterRulesFromGroup(filters.dimensions)
            : []
    ).map((filter) => renderFilterGroupSql(filter, explore));
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
        return {
            query: [cte, finalSelect, finalFrom, sqlOrderBy, sqlLimit].join(
                '\n',
            ),
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
