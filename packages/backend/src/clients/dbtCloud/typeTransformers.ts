import {
    assertUnreachable,
    DbtDimensionType,
    DbtGraphQLWhereInput,
    DbtMetricType,
    DbtTimeGranularity,
    DbtWhereOperator,
    isSemanticLayerExactTimeFilter,
    isSemanticLayerRangeTimeFilter,
    isSemanticLayerStringFilter,
    isSemanticLayerTimeFilter,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRangeTimeOperator,
    SemanticLayerTimeGranularity,
    type SemanticLayerExactTimeFilter,
    type SemanticLayerRangeTimeFilter,
    type SemanticLayerStringFilter,
    type SemanticLayerTimeFilter,
} from '@lightdash/common';

export function getSemanticLayerTypeFromDbtType(
    dbtType: DbtDimensionType | DbtMetricType,
): SemanticLayerFieldType {
    switch (dbtType) {
        case DbtDimensionType.CATEGORICAL:
            return SemanticLayerFieldType.STRING;
        case DbtDimensionType.TIME:
            return SemanticLayerFieldType.TIME;
        case DbtMetricType.CONVERSION:
        case DbtMetricType.CUMULATIVE:
        case DbtMetricType.RATIO:
        case DbtMetricType.DERIVED:
        case DbtMetricType.SIMPLE:
            return SemanticLayerFieldType.NUMBER;
        default:
            return assertUnreachable(dbtType, `Unknown dbt type: ${dbtType}`);
    }
}

export const getSemanticLayerTimeGranularity = (
    granularity: DbtTimeGranularity,
): SemanticLayerTimeGranularity => {
    switch (granularity) {
        case DbtTimeGranularity.NANOSECOND:
            return SemanticLayerTimeGranularity.NANOSECOND;
        case DbtTimeGranularity.MICROSECOND:
            return SemanticLayerTimeGranularity.MICROSECOND;
        case DbtTimeGranularity.MILLISECOND:
            return SemanticLayerTimeGranularity.MILLISECOND;
        case DbtTimeGranularity.SECOND:
            return SemanticLayerTimeGranularity.SECOND;
        case DbtTimeGranularity.MINUTE:
            return SemanticLayerTimeGranularity.MINUTE;
        case DbtTimeGranularity.HOUR:
            return SemanticLayerTimeGranularity.HOUR;
        case DbtTimeGranularity.DAY:
            return SemanticLayerTimeGranularity.DAY;
        case DbtTimeGranularity.WEEK:
            return SemanticLayerTimeGranularity.WEEK;
        case DbtTimeGranularity.MONTH:
            return SemanticLayerTimeGranularity.MONTH;
        case DbtTimeGranularity.QUARTER:
            return SemanticLayerTimeGranularity.QUARTER;
        case DbtTimeGranularity.YEAR:
            return SemanticLayerTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                granularity,
                `Unknown dbt time granularity: ${granularity}`,
            );
    }
};

export const getDbtTimeGranularity = (
    granularity: SemanticLayerTimeGranularity,
) => {
    switch (granularity) {
        case SemanticLayerTimeGranularity.NANOSECOND:
            return DbtTimeGranularity.NANOSECOND;
        case SemanticLayerTimeGranularity.MICROSECOND:
            return DbtTimeGranularity.MICROSECOND;
        case SemanticLayerTimeGranularity.MILLISECOND:
            return DbtTimeGranularity.MILLISECOND;
        case SemanticLayerTimeGranularity.SECOND:
            return DbtTimeGranularity.SECOND;
        case SemanticLayerTimeGranularity.MINUTE:
            return DbtTimeGranularity.MINUTE;
        case SemanticLayerTimeGranularity.HOUR:
            return DbtTimeGranularity.HOUR;
        case SemanticLayerTimeGranularity.DAY:
            return DbtTimeGranularity.DAY;
        case SemanticLayerTimeGranularity.WEEK:
            return DbtTimeGranularity.WEEK;
        case SemanticLayerTimeGranularity.MONTH:
            return DbtTimeGranularity.MONTH;
        case SemanticLayerTimeGranularity.QUARTER:
            return DbtTimeGranularity.QUARTER;
        case SemanticLayerTimeGranularity.YEAR:
            return DbtTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                granularity,
                `Unknown semantic layer time granularity: ${granularity}`,
            );
    }
};

const getDbtFilterOperatorFromSemanticLayerBaseOperator = (
    operator: SemanticLayerFilterBaseOperator,
    values: SemanticLayerFilter['values'],
): DbtWhereOperator => {
    switch (operator) {
        case SemanticLayerFilterBaseOperator.IS:
            if (values.length > 1) {
                return DbtWhereOperator.IN;
            }

            return DbtWhereOperator.EQUALS;
        case SemanticLayerFilterBaseOperator.IS_NOT:
            if (values.length > 1) {
                return DbtWhereOperator.NOT_IN;
            }

            return DbtWhereOperator.NOT_EQUALS;
        default:
            return assertUnreachable(
                operator,
                `Unknown semantic layer filter operator: ${operator}`,
            );
    }
};

const getDbtFilterValuesFromSemanticLayerFilterValues = (
    values: SemanticLayerFilter['values'],
) => {
    if (values.length > 1) {
        return `(${values.map((value) => `'${value}'`).join(', ')})`;
    }

    return `'${values[0]}'`;
};

const getStringFilterSql = (filter: SemanticLayerStringFilter) =>
    `{{ Dimension('${
        filter.field
    }') }} ${getDbtFilterOperatorFromSemanticLayerBaseOperator(
        filter.operator,
        filter.values,
    )} ${getDbtFilterValuesFromSemanticLayerFilterValues(filter.values)}`;

const getExactTimeFilterSql = (filter: SemanticLayerExactTimeFilter) =>
    `{{ TimeDimension('${
        filter.field
    }', 'day') }} ${getDbtFilterOperatorFromSemanticLayerBaseOperator(
        filter.operator,
        filter.values,
    )} ${getDbtFilterValuesFromSemanticLayerFilterValues(filter.values)}`;

const getRangeTimeFilterSql = (filter: SemanticLayerRangeTimeFilter) => {
    if (filter.values.length !== 2) {
        throw new Error('Range time filter values must have exactly 2 values');
    }

    switch (filter.operator) {
        case SemanticLayerFilterRangeTimeOperator.BETWEEN:
            return `{{ TimeDimension('${filter.field}', 'day') }} >= '${filter.values[0]}' AND {{ TimeDimension('${filter.field}', 'day') }} <= '${filter.values[1]}'`;
        case SemanticLayerFilterRangeTimeOperator.NOT_BETWEEN:
            return `{{ TimeDimension('${filter.field}', 'day') }} < '${filter.values[0]}' OR {{ TimeDimension('${filter.field}', 'day') }} > '${filter.values[1]}'`;
        default:
            return assertUnreachable(
                filter.operator,
                `Unknown semantic layer time filter operator: ${filter.operator}`,
            );
    }
};

const getTimeFilterSql = (filter: SemanticLayerTimeFilter) => {
    if (isSemanticLayerExactTimeFilter(filter)) {
        return getExactTimeFilterSql(filter);
    }

    if (isSemanticLayerRangeTimeFilter(filter)) {
        return getRangeTimeFilterSql(filter);
    }

    throw new Error('Unsupported filter type');
};

const getDbtFilterSqlFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): string => {
    if (filter.values.length === 0) {
        return 'TRUE';
    }

    let baseFilterSql: string | undefined;

    if (isSemanticLayerStringFilter(filter)) {
        baseFilterSql = getStringFilterSql(filter);
    } else if (isSemanticLayerTimeFilter(filter)) {
        baseFilterSql = getTimeFilterSql(filter);
    } else {
        throw new Error('Unsupported filter type');
    }

    const andSql = filter.and
        ?.map(getDbtFilterSqlFromSemanticLayerFilter)
        .join(' AND');

    const orSql = filter.or
        ?.map(getDbtFilterSqlFromSemanticLayerFilter)
        .join(' OR ');

    let sql = baseFilterSql;

    if (andSql) {
        sql += ` AND (${andSql})`;
    }

    if (orSql) {
        sql += ` OR (${orSql})`;
    }

    return sql;
};

export const getDbtFilterFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): DbtGraphQLWhereInput => ({
    sql: getDbtFilterSqlFromSemanticLayerFilter(filter),
});
