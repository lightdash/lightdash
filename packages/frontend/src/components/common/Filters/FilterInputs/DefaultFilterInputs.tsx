import { InputGroup, NumericInput, TagInput } from '@blueprintjs/core';
import {
    FilterableField,
    FilterOperator,
    FilterRule,
    FilterType,
} from '@lightdash/common';
import { FC } from 'react';
import { useFiltersContext } from '../FiltersProvider';
import StringMultiSelect from './StringAutoComplete';

export type FilterInputsProps<T extends FilterRule = FilterRule> = {
    filterType: FilterType;
    field: FilterableField;
    filterRule: T;
    onChange: (value: FilterRule) => void;
};

const DefaultFilterInputs: FC<FilterInputsProps> = ({
    filterType,
    filterRule,
    onChange,
}) => {
    const { getField } = useFiltersContext();
    const suggestions = getField(filterRule)?.suggestions;
    const filterOperator = filterRule.operator;
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return <span style={{ width: '100%' }} />;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS: {
            if (
                filterType === FilterType.STRING &&
                suggestions &&
                suggestions.length > 0
            ) {
                return (
                    <StringMultiSelect
                        values={filterRule.values || []}
                        suggestions={suggestions}
                        onChange={(values) =>
                            onChange({
                                ...filterRule,
                                values,
                            })
                        }
                    />
                );
            }
            return (
                <TagInput
                    fill
                    addOnBlur
                    inputProps={{
                        type:
                            filterType === FilterType.NUMBER
                                ? 'number'
                                : 'text',
                    }}
                    tagProps={{ minimal: true }}
                    values={filterRule.values || []}
                    onChange={(values) =>
                        onChange({
                            ...filterRule,
                            values,
                        })
                    }
                />
            );
        }

        case FilterOperator.STARTS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
            return (
                <InputGroup
                    fill
                    value={filterRule.values?.[0] || ''}
                    onChange={(e) =>
                        onChange({
                            ...filterRule,
                            values: [e.currentTarget.value],
                        })
                    }
                />
            );
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.IN_THE_PAST:
            const parsedValue = parseInt(filterRule.values?.[0], 10);
            return (
                <NumericInput
                    fill
                    value={isNaN(parsedValue) ? undefined : parsedValue}
                    min={0}
                    onValueChange={(value) =>
                        onChange({
                            ...filterRule,
                            values: [value],
                        })
                    }
                />
            );
        default: {
            const never: never = filterRule.operator;
            throw Error(
                `No form implemented for String filter operator ${filterOperator}`,
            );
        }
    }
};

export default DefaultFilterInputs;
