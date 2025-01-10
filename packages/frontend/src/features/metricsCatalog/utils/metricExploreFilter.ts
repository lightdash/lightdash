import {
    DimensionType,
    FilterOperator,
    getFilterRuleWithDefaultValue,
    getItemId,
    type CompiledDimension,
    type FilterRule,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

export interface FilterOperatorOption {
    value: FilterOperator;
    label: string;
}

export const getOperatorOptions = (
    dimension?: CompiledDimension,
): FilterOperatorOption[] => {
    const baseOperators = [
        {
            value: FilterOperator.EQUALS,
            label: 'is',
        },
        {
            value: FilterOperator.NOT_EQUALS,
            label: 'is not',
        },
    ];

    if (dimension?.type === DimensionType.BOOLEAN) {
        return baseOperators.map((op) => ({
            ...op,
            label: op.value === FilterOperator.EQUALS ? 'is true' : 'is false',
        }));
    }

    return baseOperators;
};

export const doesDimensionRequireValues = (dimension: CompiledDimension) =>
    dimension.type !== DimensionType.BOOLEAN;

export const createFilterRule = (
    dimension: CompiledDimension,
    operator: FilterOperator,
    values?: string[],
): FilterRule => {
    return getFilterRuleWithDefaultValue(
        dimension,
        {
            id: uuidv4(),
            target: {
                fieldId: getItemId(dimension),
            },
            operator,
        },
        doesDimensionRequireValues(dimension) ? values : [],
    );
};
