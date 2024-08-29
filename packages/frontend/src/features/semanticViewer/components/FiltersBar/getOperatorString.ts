import {
    assertUnreachable,
    SemanticLayerStringFilterOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';

export default function getOperatorString(
    operator: SemanticLayerFilter['operator'],
) {
    switch (operator) {
        case SemanticLayerStringFilterOperator.IS:
            return 'is';
        case SemanticLayerStringFilterOperator.IS_NOT:
            return 'is not';
        default:
            return assertUnreachable(operator, `Unknown operator: ${operator}`);
    }
}
