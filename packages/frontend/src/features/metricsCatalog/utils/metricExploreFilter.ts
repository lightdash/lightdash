import {
    DimensionType,
    FilterOperator,
    getFilterRuleFromFieldWithDefaultValue,
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

function getBooleanValueFromOperator(operator: FilterOperator) {
    return operator === FilterOperator.EQUALS ? true : false;
}

export const createFilterRule = (
    dimension: CompiledDimension,
    operator: FilterOperator,
    values?: string[],
): FilterRule => {
    const isBooleanDimension = dimension.type === DimensionType.BOOLEAN;
    return getFilterRuleFromFieldWithDefaultValue(
        dimension,
        {
            id: uuidv4(),
            target: {
                fieldId: getItemId(dimension),
            },
            operator: isBooleanDimension ? FilterOperator.EQUALS : operator,
        },
        isBooleanDimension ? [getBooleanValueFromOperator(operator)] : values,
    );
};
