import {
    DimensionType,
    FilterOperator,
    getFilterRuleFromFieldWithDefaultValue,
    getItemId,
    METRICS_EXPLORER_FILTER_OPERATORS,
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
    const isBoolean = dimension?.type === DimensionType.BOOLEAN;
    return METRICS_EXPLORER_FILTER_OPERATORS.map((value) => {
        if (value === FilterOperator.EQUALS) {
            return { value, label: isBoolean ? 'is true' : 'is' };
        }
        return { value, label: isBoolean ? 'is false' : 'is not' };
    });
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
