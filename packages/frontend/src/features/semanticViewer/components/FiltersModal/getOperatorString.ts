import {
    assertUnreachable,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterTimeOperator,
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
        case SemanticLayerFilterTimeOperator.IN:
            return 'in';
        case SemanticLayerFilterTimeOperator.NOT_IN:
            return 'not in';
        default:
            return assertUnreachable(operator, `Unknown operator: ${operator}`);
    }
}
