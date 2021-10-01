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

type FilterFormProps = {
    filterGroupType: DateFilterGroup['type'] | TimestampFilterGroup['type'];
    filter: DateAndTimestampFilter;
    onChange: (filter: DateAndTimestampFilter) => void;
};
const DateFilterForm: FC<FilterFormProps> = ({
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
                    value={new Date(filter.value)}
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

export default DateFilterForm;
