import { ControlGroup } from '@blueprintjs/core';
import React from 'react';
import { StringFilter, StringFilterGroup } from 'common';
import StringFilterForm, {
    defaultValuesForNewStringFilter,
} from './StringFilterForm';
import SelectFilterOperator from '../common/SelectFilterOperator';
import FilterRows from '../common/FilterRows';

const options: { value: StringFilter['operator']; label: string }[] = [
    { value: 'isNull', label: 'is null' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'notNull', label: 'is not null' },
    { value: 'equals', label: 'is equal to' },
    { value: 'notEquals', label: 'is not equal to' },
    { value: 'doesNotInclude', label: 'does not include' },
];

type StringFilterGroupFormProps = {
    filterGroup: StringFilterGroup;
    onChange: (filterGroup: StringFilterGroup) => void;
};

const StringFilterGroupForm = ({
    filterGroup,
    onChange,
}: StringFilterGroupFormProps) => (
    <FilterRows
        filterGroup={filterGroup}
        onChange={onChange}
        defaultNewFilter={defaultValuesForNewStringFilter.equals}
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
                                defaultValuesForNewStringFilter[operator],
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
                <StringFilterForm
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

export default StringFilterGroupForm;
