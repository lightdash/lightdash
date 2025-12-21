import {
    assertUnreachable,
    DbtDimensionType,
    DbtGraphQLWhereInput,
    DbtMetricType,
    DbtTimeGranularity,
    DbtWhereOperator,
    isSemanticLayerBaseOperator,
    isSemanticLayerExactTimeFilter,
    isSemanticLayerRelativeTimeFilter,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRelativeTimeValue,
    SemanticLayerTimeGranularity,
    type SemanticLayerExactTimeFilter,
    type SemanticLayerRelativeTimeFilter,
    type SemanticLayerStringFilter,
    type SemanticLayerTimeFilter,
} from '@lightdash/common';
import moment from 'moment';

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

const getSimpleDbtValuesFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
) => {
    if (isSemanticLayerExactTimeFilter(filter)) {
        return `'${filter.values.time}'`;
    }

    if (
        isSemanticLayerRelativeTimeFilter(filter) ||
        !filter.values ||
        filter.values.length === 0
    ) {
        throw new Error(`Unsupported values: ${filter.values}`);
    }

    if (filter.values.length > 1) {
        return `(${filter.values.map((value) => `'${value}'`).join(', ')})`;
    }

    return `'${filter.values[0]}'`;
};

const getSimpleDbtOperator = (
    filter: SemanticLayerFilter,
): DbtWhereOperator => {
    if (!isSemanticLayerBaseOperator(filter.operator)) {
        throw new Error(`Unsupported operator type: ${filter.operator}`);
    }

    if (isSemanticLayerRelativeTimeFilter(filter) || !filter.values) {
        throw new Error(
            `Unsupported values for simple operator: ${filter.values}`,
        );
    }

    switch (filter.operator) {
        case SemanticLayerFilterBaseOperator.IS:
            if (
                !isSemanticLayerExactTimeFilter(filter) &&
                filter.values.length > 1
            ) {
                return DbtWhereOperator.IN;
            }

            return DbtWhereOperator.EQUALS;
        case SemanticLayerFilterBaseOperator.IS_NOT:
            if (
                !isSemanticLayerExactTimeFilter(filter) &&
                filter.values.length > 1
            ) {
                return DbtWhereOperator.NOT_IN;
            }

            return DbtWhereOperator.NOT_EQUALS;
        default:
            return assertUnreachable(
                filter.operator,
                `Unknown semantic layer filter operator: ${filter.operator}`,
            );
    }
};

const getRelativeTimeDbtOperators = (
    filter: SemanticLayerRelativeTimeFilter,
): [DbtWhereOperator, DbtWhereOperator | undefined] => {
    const { operator, values } = filter;
    const { relativeTime } = values;

    switch (operator) {
        case SemanticLayerFilterBaseOperator.IS:
            if (
                relativeTime === SemanticLayerFilterRelativeTimeValue.TODAY ||
                relativeTime === SemanticLayerFilterRelativeTimeValue.YESTERDAY
            ) {
                return [DbtWhereOperator.EQUALS, undefined];
            }

            return [DbtWhereOperator.GTE, DbtWhereOperator.LTE];
        case SemanticLayerFilterBaseOperator.IS_NOT:
            if (
                relativeTime === SemanticLayerFilterRelativeTimeValue.TODAY ||
                relativeTime === SemanticLayerFilterRelativeTimeValue.YESTERDAY
            ) {
                return [DbtWhereOperator.NOT_EQUALS, undefined];
            }

            return [DbtWhereOperator.LT, undefined];
        default:
            return assertUnreachable(
                operator,
                `Unknown semantic layer filter operator: ${operator}`,
            );
    }
};

const getStringFilterSql = (filter: SemanticLayerStringFilter) =>
    `{{ Dimension('${filter.fieldRef}') }} ${getSimpleDbtOperator(
        filter,
    )} ${getSimpleDbtValuesFromSemanticLayerFilter(filter)}`;

const getExactTimeFilterSql = (filter: SemanticLayerExactTimeFilter) =>
    `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${getSimpleDbtOperator(
        filter,
    )} ${getSimpleDbtValuesFromSemanticLayerFilter(filter)}`;

const getRelativeTimeFilterSql = (
    filter: SemanticLayerRelativeTimeFilter,
    now = moment(),
) => {
    const today = now.format('YYYY-MM-DD');
    const dbtOperators = getRelativeTimeDbtOperators(filter);

    switch (filter.values.relativeTime) {
        case SemanticLayerFilterRelativeTimeValue.TODAY:
            return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${today}'`;
        case SemanticLayerFilterRelativeTimeValue.YESTERDAY:
            const yesterday = now
                .clone()
                .subtract(1, 'day')
                .format('YYYY-MM-DD');

            return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${yesterday}'`;
        case SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS:
            const sevenDaysAgo = now
                .clone()
                .subtract(7, 'day')
                .format('YYYY-MM-DD');

            if (dbtOperators[1]) {
                return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${sevenDaysAgo}' AND {{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[1]} '${today}'`;
            }

            return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${sevenDaysAgo}'`;
        case SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS:
            const thirtyDaysAgo = now
                .clone()
                .subtract(30, 'day')
                .format('YYYY-MM-DD');

            if (dbtOperators[1]) {
                return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${thirtyDaysAgo}' AND {{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[1]} '${today}'`;
            }

            return `{{ TimeDimension('${filter.fieldRef}', 'day') }} ${dbtOperators[0]} '${thirtyDaysAgo}'`;
        default:
            return assertUnreachable(
                filter.values.relativeTime,
                `Unknown semantic layer relative time value: ${filter.values.relativeTime}`,
            );
    }
};

const getTimeFilterSql = (filter: SemanticLayerTimeFilter) => {
    if (isSemanticLayerExactTimeFilter(filter)) {
        return getExactTimeFilterSql(filter);
    }

    if (isSemanticLayerRelativeTimeFilter(filter)) {
        return getRelativeTimeFilterSql(filter);
    }

    throw new Error('Unsupported filter type');
};

const getDbtFilterSqlFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): string => {
    if (
        filter.fieldType !== SemanticLayerFieldType.TIME &&
        filter.values &&
        filter.values.length === 0
    ) {
        return 'TRUE';
    }

    let baseFilterSql: string | undefined;

    if (filter.fieldType === SemanticLayerFieldType.STRING) {
        baseFilterSql = getStringFilterSql(filter);
    } else if (filter.fieldType === SemanticLayerFieldType.TIME) {
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
