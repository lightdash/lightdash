import { NumericInput, TagInput } from '@blueprintjs/core';
import React from 'react';
import { BooleanFilter, NumberFilter } from 'common';

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

export const defaultValuesForNewBooleanFilter: {
    [key in BooleanFilter['operator']]: BooleanFilter;
} = {
    is: { operator: 'is', value: false },
};

type NumberFilterFormProps = {
    filter: NumberFilter;
    onChange: (filter: NumberFilter) => void;
};
const NumberFilterForm = ({ filter, onChange }: NumberFilterFormProps) => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'isNull':
            return <div />;
        case 'notNull':
            return <div />;
        case 'equals':
            return (
                <TagInput
                    fill
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
        case 'notEquals':
            return (
                <TagInput
                    fill
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
            return (
                <NumericInput
                    fill
                    value={filter.value}
                    onValueChange={(value) => onChange({ ...filter, value })}
                />
            );
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
