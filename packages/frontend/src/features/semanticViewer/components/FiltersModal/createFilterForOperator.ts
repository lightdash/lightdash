import {
    isSemanticLayerBaseOperator,
    isSemanticLayerRelativeTimeOperator,
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

    if (isSemanticLayerRelativeTimeOperator(operator)) {
        return {
            ...rest,
            operator,
            values: undefined,
        };
    }

    if (isSemanticLayerBaseOperator(operator)) {
        return {
            ...rest,
            operator,
            values: [],
        };
    }

    throw new Error(`Unsupported operator type: ${operator}`);
}
