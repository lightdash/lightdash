import {
    isSemanticLayerBaseOperator,
    isSemanticLayerRelativeTimeOperator,
    type SemanticLayerFilter,
} from '@lightdash/common';
import { v4 as uuidV4 } from 'uuid';

type FilterBaseArgs = {
    field: string;
    fieldKind: SemanticLayerFilter['fieldKind'];
    fieldType: SemanticLayerFilter['fieldType'];
    operator: SemanticLayerFilter['operator'];
};

export function createFilterForOperator(
    args: FilterBaseArgs,
): SemanticLayerFilter {
    const { operator, ...rest } = args;
    const uuid = uuidV4();

    if (isSemanticLayerRelativeTimeOperator(operator)) {
        return {
            ...rest,
            uuid,
            operator,
            values: undefined,
        };
    }

    if (isSemanticLayerBaseOperator(operator)) {
        return {
            ...rest,
            uuid,
            operator,
            values: [],
        };
    }

    throw new Error(`Unsupported operator type: ${operator}`);
}
