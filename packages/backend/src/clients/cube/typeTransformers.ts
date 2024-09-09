import {
    BinaryOperator,
    Filter,
    TCubeMemberType,
    TimeDimensionGranularity,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    isSemanticLayerRelativeTimeFilter,
    isSemanticLayerRelativeTimeOperator,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRelativeTimeOperator,
    SemanticLayerTimeGranularity,
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

const getCubeFilterOperatorFromSemanticLayerFilterOperator = (
    operator: SemanticLayerFilter['operator'],
): BinaryOperator => {
    switch (operator) {
        case SemanticLayerFilterBaseOperator.IS:
        case SemanticLayerFilterRelativeTimeOperator.IS_TODAY:
        case SemanticLayerFilterRelativeTimeOperator.IS_YESTERDAY:
            return 'equals';
        case SemanticLayerFilterBaseOperator.IS_NOT:
            return 'notEquals';
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_7_DAYS:
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_30_DAYS:
            return 'inDateRange';
        default:
            return assertUnreachable(
                operator,
                `Unknown filter operator: ${operator}`,
            );
    }
};

const getCubeFilterValuesForRelativeTimeOperator = (
    operator: SemanticLayerFilterRelativeTimeOperator,
    now = moment(),
): string[] => {
    const today = now.format('YYYY-MM-DD');
    switch (operator) {
        case SemanticLayerFilterRelativeTimeOperator.IS_TODAY:
            return [today];
        case SemanticLayerFilterRelativeTimeOperator.IS_YESTERDAY:
            const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
            return [yesterday];
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_7_DAYS:
            const sevenDaysAgo = now.subtract(7, 'day').format('YYYY-MM-DD');
            return [sevenDaysAgo, today];
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_30_DAYS:
            const thirtyDaysAgo = now.subtract(30, 'day').format('YYYY-MM-DD');
            return [thirtyDaysAgo, today];
        default:
            return assertUnreachable(
                operator,
                `Unknown filter operator: ${operator}`,
            );
    }
};

export const getCubeFilterFromSemanticLayerFilter = (
    filter: SemanticLayerFilter,
): Filter => ({
    member: filter.field,
    operator: getCubeFilterOperatorFromSemanticLayerFilterOperator(
        filter.operator,
    ),
    values: isSemanticLayerRelativeTimeFilter(filter)
        ? getCubeFilterValuesForRelativeTimeOperator(filter.operator)
        : filter.values,
    ...(filter.or && {
        or: filter.or.map(getCubeFilterFromSemanticLayerFilter),
    }),
    ...(filter.and && {
        and: filter.and.map(getCubeFilterFromSemanticLayerFilter),
    }),
});
