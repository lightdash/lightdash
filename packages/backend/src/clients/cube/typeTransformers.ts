import {
    BinaryOperator,
    Filter,
    TCubeMemberType,
    TimeDimensionGranularity,
} from '@cubejs-client/core';
import {
    assertUnreachable,
    SemanticLayerFieldType,
    SemanticLayerFilter,
    SemanticLayerStringFilterOperator,
    SemanticLayerTimeGranularity,
} from '@lightdash/common';

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

export const getCubeFilterOperatorFromSemanticLayerFilterOperator = (
    operator: SemanticLayerStringFilterOperator,
): BinaryOperator => {
    switch (operator) {
        case SemanticLayerStringFilterOperator.IS:
            return 'equals';
        case SemanticLayerStringFilterOperator.IS_NOT:
            return 'notEquals';
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
    values: filter.values,
});
