import {
    assertUnreachable,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRangeTimeOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';

export default function getOperatorString(
    operator: SemanticLayerFilter['operator'],
) {
    switch (operator) {
        case SemanticLayerFilterBaseOperator.IS:
            return 'is';
        case SemanticLayerFilterBaseOperator.IS_NOT:
            return 'is not';
        case SemanticLayerFilterRangeTimeOperator.BETWEEN:
            return 'between';
        case SemanticLayerFilterRangeTimeOperator.NOT_BETWEEN:
            return 'not between';
        default:
            return assertUnreachable(operator, `Unknown operator: ${operator}`);
    }
}
