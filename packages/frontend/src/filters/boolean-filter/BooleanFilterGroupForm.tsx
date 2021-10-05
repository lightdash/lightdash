import { BooleanFilter, BooleanFilterGroup } from 'common';
import React from 'react';
import { ControlGroup } from '@blueprintjs/core';
import FilterRows from '../common/FilterRows';
import BooleanFilterForm, {
    defaultValuesForNewBooleanFilter,
} from './BooleanFilterForm';
import SelectFilterOperator from '../common/SelectFilterOperator';

type BooleanFilterGroupProps = {
    filterGroup: BooleanFilterGroup;
    onChange: (filterGroup: BooleanFilterGroup) => void;
};

const options: { value: BooleanFilter['operator']; label: string }[] = [
    { value: 'equals', label: 'is equal to' },
    { value: 'notNull', label: 'is not null' },
    { value: 'isNull', label: 'is null' },
];

const BooleanFilterGroupForm = ({
    filterGroup,
    onChange,
}: BooleanFilterGroupProps) => (
    <FilterRows
        filterGroup={filterGroup}
        onChange={onChange}
        defaultNewFilter={{ operator: 'equals', value: true }}
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
                                defaultValuesForNewBooleanFilter[operator],
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
                <BooleanFilterForm
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

export default BooleanFilterGroupForm;
