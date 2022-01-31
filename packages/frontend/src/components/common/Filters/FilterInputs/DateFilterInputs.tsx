import { DateInput, TimePrecision } from '@blueprintjs/datetime';
import {
    DimensionType,
    FilterOperator,
    formatDate,
    formatTimestamp,
    parseDate,
    parseTimestamp,
} from 'common';
import React, { FC } from 'react';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';

const DateFilterInputs: FC<FilterInputsProps> = (props) => {
    const { field, filterRule, onChange } = props;
    const isTimestamp = field.type === DimensionType.TIMESTAMP;
    switch (filterRule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return (
                <DateInput
                    fill
                    value={
                        filterRule.values?.[0]
                            ? new Date(filterRule.values?.[0])
                            : new Date()
                    }
                    timePrecision={
                        isTimestamp ? TimePrecision.MILLISECOND : undefined
                    }
                    formatDate={isTimestamp ? formatTimestamp : formatDate}
                    parseDate={isTimestamp ? parseTimestamp : parseDate}
                    defaultValue={new Date()}
                    onChange={(value: Date | null) => {
                        if (value) {
                            onChange({
                                ...filterRule,
                                values: [value],
                            });
                        }
                    }}
                />
            );
        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default DateFilterInputs;
