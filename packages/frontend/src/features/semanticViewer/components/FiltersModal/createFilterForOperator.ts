import {
    assertUnreachable,
    SemanticLayerFieldType,
    SemanticLayerFilterRelativeTimeValue,
    type SemanticLayerFilter,
} from '@lightdash/common';
import { v4 as uuidV4 } from 'uuid';

type FilterBaseArgs = Pick<
    SemanticLayerFilter,
    'fieldRef' | 'fieldKind' | 'fieldType' | 'operator'
>;

export function createFilterForOperator(
    args: FilterBaseArgs,
): SemanticLayerFilter {
    const { operator, fieldType, ...rest } = args;
    const uuid = uuidV4();

    switch (fieldType) {
        case SemanticLayerFieldType.STRING:
            return {
                ...rest,
                fieldType,
                uuid,
                operator,
                values: [],
            };
        case SemanticLayerFieldType.TIME:
            return {
                ...rest,
                fieldType,
                uuid,
                operator,
                values: {
                    relativeTime: SemanticLayerFilterRelativeTimeValue.TODAY,
                },
            };
        default:
            return assertUnreachable(
                fieldType,
                `Unknown field type: ${fieldType}`,
            );
    }

    throw new Error(`Unsupported operator type: ${operator}`);
}
