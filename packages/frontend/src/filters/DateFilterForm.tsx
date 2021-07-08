import { ControlGroup } from '@blueprintjs/core';
import { DateInput, TimePrecision } from '@blueprintjs/datetime';
import React, { FC } from 'react';
import {
    DateAndTimestampFilter,
    DateFilterGroup,
    formatDate,
    parseDate,
    formatTimestamp,
    parseTimestamp,
    TimestampFilterGroup,
} from 'common';
import { FilterRow, SelectFilterOperator } from './FilterRow';

export const defaultValuesForNewDateFilter: {
    [key in DateAndTimestampFilter['operator']]: DateAndTimestampFilter;
} = {
    equals: { operator: 'equals', value: new Date() },
    notEquals: { operator: 'notEquals', value: new Date() },
    isNull: { operator: 'isNull' },
    notNull: { operator: 'notNull' },
    greaterThan: { operator: 'greaterThan', value: new Date() },
    greaterThanOrEqual: { operator: 'greaterThanOrEqual', value: new Date() },
    lessThan: { operator: 'lessThan', value: new Date() },
    lessThanOrEqual: { operator: 'lessThanOrEqual', value: new Date() },
};

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

type FilterFormProps = {
    filterGroupType: DateFilterGroup['type'] | TimestampFilterGroup['type'];
    filter: DateAndTimestampFilter;
    onChange: (filter: DateAndTimestampFilter) => void;
};
const FilterForm: FC<FilterFormProps> = ({
    filterGroupType,
    filter,
    onChange,
}) => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'isNull':
        case 'notNull':
            return null;
        case 'equals':
        case 'notEquals':
        case 'lessThan':
        case 'lessThanOrEqual':
        case 'greaterThan':
        case 'greaterThanOrEqual':
            return (
                <DateInput
                    timePrecision={
                        filterGroupType === 'timestamp'
                            ? TimePrecision.MILLISECOND
                            : undefined
                    }
                    formatDate={
                        filterGroupType === 'timestamp'
                            ? formatTimestamp
                            : formatDate
                    }
                    parseDate={
                        filterGroupType === 'timestamp'
                            ? parseTimestamp
                            : parseDate
                    }
                    defaultValue={new Date()}
                    onChange={(value) => onChange({ ...filter, value })}
                />
            );

        default:
            throw Error(
                `No form implemented for String filter operator ${filterType}`,
            );
    }
};

type DateFilterGroupFormProps = {
    filterGroup: DateFilterGroup | TimestampFilterGroup;
    onChange: (filterGroup: DateFilterGroup | TimestampFilterGroup) => void;
};
export const DateFilterGroupForm = ({
    filterGroup,
    onChange,
}: DateFilterGroupFormProps) => {
    const defaultNewFilter: DateAndTimestampFilter = {
        operator: 'equals',
        value: new Date(),
    };
    return (
        <>
            {filterGroup.filters.map((filter, index) => (
                <FilterRow
                    key={
                        filterGroup.tableName +
                        filterGroup.fieldName +
                        filter.operator
                    }
                    isFirst={index === 0}
                    isLast={index === filterGroup.filters.length - 1}
                    tableName={filterGroup.tableName}
                    fieldName={filterGroup.fieldName}
                    onAdd={() =>
                        onChange({
                            ...filterGroup,
                            filters: [...filterGroup.filters, defaultNewFilter],
                        })
                    }
                    onDelete={() =>
                        onChange({
                            ...filterGroup,
                            filters: [
                                ...filterGroup.filters.slice(0, index),
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                >
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
                        <FilterForm
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
                </FilterRow>
            ))}
        </>
    );
};
