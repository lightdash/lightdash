import { StringFilter, StringFilterGroup } from 'common';
import React from 'react';
import { InputGroup, TagInput } from '@blueprintjs/core';

export const defaultValuesForNewStringFilter: {
    [key in StringFilter['operator']]: StringFilter;
} = {
    equals: { operator: 'equals', values: [] },
    notEquals: { operator: 'notEquals', values: [] },
    startsWith: { operator: 'startsWith', value: '' },
    isNull: { operator: 'isNull' },
    notNull: { operator: 'notNull' },
};

type StringFilterFormProps = {
    filter: StringFilter;
    onChange: (filter: StringFilter) => void;
};
// Can't switch generic: https://github.com/microsoft/TypeScript/pull/43183
const StringFilterForm = ({ filter, onChange }: StringFilterFormProps) => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return (
                <TagInput
                    fill
                    addOnBlur
                    tagProps={{ minimal: true }}
                    values={filter.values}
                    onAdd={(values) =>
                        onChange({
                            ...filter,
                            values: [...filter.values, ...values],
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
                    addOnBlur
                    tagProps={{ minimal: true }}
                    values={filter.values}
                    onAdd={(values) =>
                        onChange({
                            ...filter,
                            values: [...filter.values, ...values],
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
        case 'isNull':
            return null;
        case 'notNull':
            return <div />;
        case 'startsWith':
            return (
                <InputGroup
                    fill
                    value={filter.value}
                    onChange={(e) =>
                        onChange({ ...filter, value: e.currentTarget.value })
                    }
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

export default StringFilterForm;
