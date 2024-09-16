import {
    isSemanticLayerBaseOperator,
    isSemanticLayerTimeFilter,
    SemanticLayerFilterRelativeTimeValue,
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

    if (isSemanticLayerTimeFilter(args)) {
        return {
            ...rest,
            uuid,
            operator,
            values: undefined,
            relativeTime: SemanticLayerFilterRelativeTimeValue.TODAY,
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
