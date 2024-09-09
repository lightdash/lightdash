import {
    assertUnreachable,
    SemanticLayerFilterBaseOperator,
    SemanticLayerFilterRelativeTimeOperator,
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
        case SemanticLayerFilterRelativeTimeOperator.IS_TODAY:
            return 'today';
        case SemanticLayerFilterRelativeTimeOperator.IS_YESTERDAY:
            return 'yesterday';
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_7_DAYS:
            return 'last 7 days';
        case SemanticLayerFilterRelativeTimeOperator.IN_LAST_30_DAYS:
            return 'last 30 days';
        default:
            return assertUnreachable(operator, `Unknown operator: ${operator}`);
    }
}
