import { HTMLSelect } from '@blueprintjs/core';
import { BooleanFilter } from 'common';
import React from 'react';

export const defaultValuesForNewBooleanFilter: {
    [key in BooleanFilter['operator']]: BooleanFilter;
} = {
    equals: { operator: 'equals', value: true },
    isNull: { operator: 'isNull' },
    notNull: { operator: 'notNull' },
};

type BooleanFilterFormProps = {
    filter: BooleanFilter;
    onChange: (filter: BooleanFilter) => void;
};

const BooleanFilterForm = ({ filter, onChange }: BooleanFilterFormProps) => {
    const { operator } = filter;
    switch (filter.operator) {
        case 'isNull':
        case 'notNull':
            return <div />;
        case 'equals':
            return (
                <HTMLSelect
                    fill
                    minimal
                    onChange={(e) =>
                        onChange({
                            ...filter,
                            value: e.currentTarget.value === 'true',
                        })
                    }
                    options={[
                        { value: 'true', label: 'True' },
                        { value: 'false', label: 'False' },
                    ]}
                    value={filter.value ? 'true' : 'false'}
                />
            );
        default: {
            const nope: never = filter;
            throw Error(
                `No form implemented for Boolean filter operator ${operator}`,
            );
        }
    }
};

export default BooleanFilterForm;
