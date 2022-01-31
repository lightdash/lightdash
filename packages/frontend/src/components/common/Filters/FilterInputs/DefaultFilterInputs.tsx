import { InputGroup, NumericInput, TagInput } from '@blueprintjs/core';
import { Field, FilterOperator, FilterRule } from 'common';
import React, { FC } from 'react';

export type FilterInputsProps = {
    field: Field;
    filterRule: FilterRule;
    onChange: (value: FilterRule) => void;
};

const DefaultFilterInputs: FC<FilterInputsProps> = ({
    filterRule,
    onChange,
}) => {
    const filterType = filterRule.operator;
    switch (filterRule.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return <span style={{ width: '100%' }} />;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            return (
                <TagInput
                    fill
                    addOnBlur
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
        case FilterOperator.STARTS_WITH:
        case FilterOperator.NOT_INCLUDE:
            return (
                <InputGroup
                    fill
                    value={filterRule.values?.[0]}
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
            return (
                <NumericInput
                    fill
                    value={filterRule.values?.[0]}
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
                `No form implemented for String filter operator ${filterType}`,
            );
        }
    }
};

export default DefaultFilterInputs;
