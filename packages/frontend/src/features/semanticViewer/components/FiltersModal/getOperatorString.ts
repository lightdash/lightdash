import {
    assertUnreachable,
    SemanticLayerFilterBaseOperator,
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
        default:
            return assertUnreachable(operator, `Unknown operator: ${operator}`);
    }
}
