import {
    BinaryOperator,
    Filter,
    TCubeMemberType,
    TimeDimensionGranularity,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    isSemanticLayerRelativeTimeFilter,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRelativeTimeValue,
    SemanticLayerTimeGranularity,
    type SemanticLayerTimeFilter,
} from '@lightdash/common';
import moment from 'moment';

export function getSemanticLayerTypeFromCubeType(
    cubeType: TCubeMemberType,
): SemanticLayerFieldType {
    switch (cubeType) {
        case 'string':
            return SemanticLayerFieldType.STRING;
        case 'number':
            return SemanticLayerFieldType.NUMBER;
        case 'boolean':
            return SemanticLayerFieldType.BOOLEAN;
        case 'time':
            return SemanticLayerFieldType.TIME;
        default:
            return assertUnreachable(
                cubeType,
                `Unknown cube type: ${cubeType}`,
            );
    }
}

export const getSemanticLayerTimeGranularity = (
    cubeGranularity: TimeDimensionGranularity,
): SemanticLayerTimeGranularity => {
    switch (cubeGranularity) {
        case 'second':
            return SemanticLayerTimeGranularity.SECOND;
        case 'minute':
            return SemanticLayerTimeGranularity.MINUTE;
        case 'hour':
            return SemanticLayerTimeGranularity.HOUR;
        case 'day':
            return SemanticLayerTimeGranularity.DAY;
        case 'week':
            return SemanticLayerTimeGranularity.WEEK;
        case 'month':
            return SemanticLayerTimeGranularity.MONTH;
        case 'quarter':
            return SemanticLayerTimeGranularity.QUARTER;
        case 'year':
            return SemanticLayerTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                cubeGranularity,
                `Unknown cube time granularity: ${cubeGranularity}`,
            );
    }
};

export const getCubeTimeDimensionGranularity = (
    semanticGranularity: SemanticLayerTimeGranularity,
): TimeDimensionGranularity => {
    switch (semanticGranularity) {
        case SemanticLayerTimeGranularity.NANOSECOND:
        case SemanticLayerTimeGranularity.MICROSECOND:
        case SemanticLayerTimeGranularity.MILLISECOND:
            throw new Error(
                'Nano, micro and millisecond granularities are not supported by cube',
            );
        case SemanticLayerTimeGranularity.SECOND:
            return 'second';
        case SemanticLayerTimeGranularity.MINUTE:
            return 'minute';
        case SemanticLayerTimeGranularity.HOUR:
            return 'hour';
        case SemanticLayerTimeGranularity.DAY:
            return 'day';
        case SemanticLayerTimeGranularity.WEEK:
            return 'week';
        case SemanticLayerTimeGranularity.MONTH:
            return 'month';
        case SemanticLayerTimeGranularity.QUARTER:
            return 'quarter';
        case SemanticLayerTimeGranularity.YEAR:
            return 'year';
        default:
            return assertUnreachable(
                semanticGranularity,
                `Unknown semantic time granularity: ${semanticGranularity}`,
            );
    }
};

const getCubeFilterOperatorForSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): BinaryOperator => {
    const { operator, values } = filter;

    switch (operator) {
        case SemanticLayerFilterBaseOperator.IS:
            if (
                isSemanticLayerRelativeTimeFilter(filter) &&
                (filter.values.relativeTime ===
                    SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS ||
                    filter.values.relativeTime ===
                        SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS)
            ) {
                return 'inDateRange';
            }

            return 'equals';
        case SemanticLayerFilterBaseOperator.IS_NOT:
            if (
                isSemanticLayerRelativeTimeFilter(filter) &&
                (filter.values.relativeTime ===
                    SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS ||
                    filter.values.relativeTime ===
                        SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS)
            ) {
                return 'notInDateRange';
            }

            return 'notEquals';
        default:
            return assertUnreachable(
                operator,
                `Unknown filter operator: ${operator}`,
            );
    }
};

const getCubeValuesForRelativeTimeValue = (
    value: SemanticLayerFilterRelativeTimeValue,
    now = moment(),
): string[] => {
    const today = now.format('YYYY-MM-DD');
    switch (value) {
        case SemanticLayerFilterRelativeTimeValue.TODAY:
            return [today];
        case SemanticLayerFilterRelativeTimeValue.YESTERDAY:
            const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
            return [yesterday];
        case SemanticLayerFilterRelativeTimeValue.LAST_7_DAYS:
            const sevenDaysAgo = now.subtract(7, 'day').format('YYYY-MM-DD');
            return [sevenDaysAgo, today];
        case SemanticLayerFilterRelativeTimeValue.LAST_30_DAYS:
            const thirtyDaysAgo = now.subtract(30, 'day').format('YYYY-MM-DD');
            return [thirtyDaysAgo, today];
        default:
            return assertUnreachable(
                value,
                `Unknown relative time value: ${value}`,
            );
    }
};

const getCubeValuesForTimeFilter = (filter: SemanticLayerTimeFilter) => {
    if (isSemanticLayerRelativeTimeFilter(filter)) {
        return getCubeValuesForRelativeTimeValue(filter.values.relativeTime);
    }

    return [filter.values.time];
};

export const getCubeFilterFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): Filter => ({
    member: filter.fieldRef,
    operator: getCubeFilterOperatorForSemanticLayerFilter(filter),
    values:
        filter.fieldType === SemanticLayerFieldType.TIME
            ? getCubeValuesForTimeFilter(filter)
            : filter.values,
    ...(filter.or && {
        or: filter.or.map(getCubeFilterFromSemanticLayerFilter),
    }),
    ...(filter.and && {
        and: filter.and.map(getCubeFilterFromSemanticLayerFilter),
    }),
});
