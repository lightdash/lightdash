import {
    assertUnreachable,
    DbtDimensionType,
    DbtGraphQLWhereInput,
    DbtMetricType,
    DbtTimeGranularity,
    DbtWhereOperator,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerStringFilterOperator,
    SemanticLayerTimeGranularity,
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

export const getDbtFilterOperatorFromSemanticLayerOperator = (
    operator: SemanticLayerFilter['operator'],
    values: SemanticLayerFilter['values'],
): DbtWhereOperator => {
    switch (operator) {
        case SemanticLayerStringFilterOperator.IS:
            if (values.length > 1) {
                return DbtWhereOperator.IN;
            }

            return DbtWhereOperator.EQUALS;
        case SemanticLayerStringFilterOperator.IS_NOT:
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

export const getDbtFilterValuesFromSemanticLayerFilterValues = (
    values: SemanticLayerFilter['values'],
) => {
    if (values.length > 1) {
        return `(${values.map((value) => `'${value}'`).join(', ')})`;
    }

    return `'${values[0]}'`;
};

const getDbtFilterSqlFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): string => {
    if (filter.values.length === 0) {
        return 'TRUE';
    }

    const baseFilterSql = `{{ Dimension('${
        filter.field
    }') }} ${getDbtFilterOperatorFromSemanticLayerOperator(
        filter.operator,
        filter.values,
    )} ${getDbtFilterValuesFromSemanticLayerFilterValues(filter.values)}`;

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
