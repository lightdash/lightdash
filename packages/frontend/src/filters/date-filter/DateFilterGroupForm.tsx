import {
    DateAndTimestampFilter,
    DateFilterGroup,
    TimestampFilterGroup,
} from 'common';
import { ControlGroup } from '@blueprintjs/core';
import React from 'react';
import DateFilterForm, {
    defaultValuesForNewDateFilter,
} from './DateFilterForm';
import SelectFilterOperator from '../common/SelectFilterOperator';
import FilterRows from '../common/FilterRows';

const options: { value: DateAndTimestampFilter['operator']; label: string }[] =
    [
        { value: 'notEquals', label: 'is not equal to' },
        { value: 'equals', label: 'is equal to' },
        { value: 'notNull', label: 'is not null' },
        { value: 'isNull', label: 'is null' },
        { value: 'lessThan', label: 'is before' },
        { value: 'lessThanOrEqual', label: 'is on or before' },
        { value: 'greaterThan', label: 'is after' },
        { value: 'greaterThanOrEqual', label: 'is on or after' },
    ];

type DateFilterGroupFormProps = {
    filterGroup: DateFilterGroup | TimestampFilterGroup;
    onChange: (filterGroup: DateFilterGroup | TimestampFilterGroup) => void;
};
const DateFilterGroupForm = ({
    filterGroup,
    onChange,
}: DateFilterGroupFormProps) => (
    <FilterRows
        filterGroup={filterGroup}
        onChange={onChange}
        defaultNewFilter={{ operator: 'equals', value: new Date() }}
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
                                defaultValuesForNewDateFilter[operator],
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
                <DateFilterForm
                    filterGroupType={filterGroup.type}
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

export default DateFilterGroupForm;
