import { NumberFilter, NumberFilterGroup } from 'common';
import { ControlGroup } from '@blueprintjs/core';
import React from 'react';
import NumberFilterForm, {
    defaultValuesForNewNumberFilter,
} from './NumberFilterForm';
import SelectFilterOperator from '../common/SelectFilterOperator';
import FilterRows from '../common/FilterRows';

const options: { value: NumberFilter['operator']; label: string }[] = [
    { value: 'notEquals', label: 'is not equal to' },
    { value: 'equals', label: 'is equal to' },
    { value: 'notNull', label: 'is not null' },
    { value: 'isNull', label: 'is null' },
    { value: 'lessThan', label: 'is less than' },
    { value: 'greaterThan', label: 'is greater than' },
];

type NumberFilterGroupFormProps = {
    filterGroup: NumberFilterGroup;
    onChange: (filterGroup: NumberFilterGroup) => void;
};
const NumberFilterGroupForm = ({
    filterGroup,
    onChange,
}: NumberFilterGroupFormProps) => (
    <FilterRows
        filterGroup={filterGroup}
        onChange={onChange}
        defaultNewFilter={{ operator: 'equals', values: [] }}
        render={({ filter, index }) => (
            <ControlGroup style={{ width: '100%' }}>
                <SelectFilterOperator
                    value={filter.operator}
                    options={options}
                    onChange={(operator) =>
                        onChange({
                            ...filterGroup,
                            filters: [
                                ...filterGroup.filters.slice(0, index),
                                defaultValuesForNewNumberFilter[operator],
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
                <NumberFilterForm
                    filter={filter}
                    onChange={(fg) =>
                        onChange({
                            ...filterGroup,
                            filters: [
                                ...filterGroup.filters.slice(0, index),
                                fg,
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
            </ControlGroup>
        )}
    />
);

export default NumberFilterGroupForm;
