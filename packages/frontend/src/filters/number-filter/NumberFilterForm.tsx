import { NumericInput, TagInput } from '@blueprintjs/core';
import { NumberFilter } from 'common';
import React from 'react';

export const defaultValuesForNewNumberFilter: {
    [key in NumberFilter['operator']]: NumberFilter;
} = {
    equals: { operator: 'equals', values: [] },
    notEquals: { operator: 'notEquals', values: [] },
    isNull: { operator: 'isNull' },
    notNull: { operator: 'notNull' },
    greaterThan: { operator: 'greaterThan', value: 0 },
    lessThan: { operator: 'lessThan', value: 0 },
};

type NumberFilterFormProps = {
    filter: NumberFilter;
    onChange: (filter: NumberFilter) => void;
};
const NumberFilterForm = ({ filter, onChange }: NumberFilterFormProps) => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'isNull':
        case 'notNull':
            return <div />;
        case 'equals':
        case 'notEquals':
            return (
                <TagInput
                    fill
                    addOnBlur
                    tagProps={{ minimal: true }}
                    values={filter.values}
                    onAdd={(values) =>
                        onChange({
                            ...filter,
                            values: [
                                ...filter.values,
                                ...values
                                    .map(parseFloat)
                                    .filter((v) => v !== undefined),
                            ],
                        })
                    }
                    onRemove={(value, index) =>
                        onChange({
                            ...filter,
                            values: [
                                ...filter.values.slice(0, index),
                                ...filter.values.slice(index + 1),
                            ],
                        })
                    }
                />
            );
        case 'greaterThan':
        case 'lessThan':
            return (
                <NumericInput
                    fill
                    value={filter.value}
                    onValueChange={(value) => onChange({ ...filter, value })}
                />
            );
        default:
            // eslint-disable-next-line
            const nope: never = filter;
            throw Error(
                `No form implemented for String filter operator ${filterType}`,
            );
    }
};

export default NumberFilterForm;
