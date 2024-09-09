import {
    isSemanticLayerBaseOperator,
    isSemanticLayerTimeFilter,
    SemanticLayerFilterRelativeTimeOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';

type FilterBaseArgs = {
    uuid: string;
    field: string;
    fieldKind: SemanticLayerFilter['fieldKind'];
    fieldType: SemanticLayerFilter['fieldType'];
    operator: SemanticLayerFilter['operator'];
};

export function createFilterForOperator(
    args: FilterBaseArgs,
): SemanticLayerFilter {
    const { operator, ...rest } = args;

    if (isSemanticLayerTimeFilter(args)) {
        // TODO: since we don't have exact time filter yet, let's enforce the use of relative time filter
        return {
            ...rest,
            operator: SemanticLayerFilterRelativeTimeOperator.IS_TODAY,
            values: undefined,
        };
    }

    if (
        isSemanticLayerBaseOperator(operator) &&
        !isSemanticLayerTimeFilter(args)
    ) {
        return {
            ...rest,
            operator,
            values: [],
        };
    }

    throw new Error(`Unsupported operator type: ${operator}`);
}
