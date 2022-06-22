import { NumericInput } from '@blueprintjs/core';
import { DateInput2 } from '@blueprintjs/datetime2';
import {
    DateFilterRule,
    DimensionType,
    FilterOperator,
    formatDate,
    formatTimestamp,
    isDimension,
    parseDate,
    parseTimestamp,
    TimeInterval,
    UnitOfTime,
} from '@lightdash/common';
import moment from 'moment';
import React, { FC } from 'react';
import MonthAndYearInput from '../../MonthAndYearInput';
import WeekPicker from '../../WeekPicker';
import YearInput from '../../YearInput';
import DefaultFilterInputs, { FilterInputsProps } from './DefaultFilterInputs';
import { MultipleInputsWrapper } from './FilterInputs.styles';
import UnitOfTimeAutoComplete from './UnitOfTimeAutoComplete';

const DateFilterInputs: FC<FilterInputsProps<DateFilterRule>> = (props) => {
    const { field, filterRule, onChange } = props;
    const isTimestamp = field.type === DimensionType.TIMESTAMP;

    switch (filterRule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            if (isDimension(field) && field.timeInterval) {
                switch (field.timeInterval.toUpperCase()) {
                    case TimeInterval.WEEK:
                        return (
                            <>
                                <span style={{ whiteSpace: 'nowrap' }}>
                                    week commencing
                                </span>
                                <WeekPicker
                                    value={
                                        filterRule.values?.[0]
                                            ? new Date(filterRule.values?.[0])
                                            : new Date()
                                    }
                                    onChange={(value: Date) => {
                                        onChange({
                                            ...filterRule,
                                            values: [moment(value).utc()],
                                        });
                                    }}
                                />
                            </>
                        );
                    case TimeInterval.MONTH:
                        return (
                            <MonthAndYearInput
                                value={filterRule.values?.[0] || new Date()}
                                onChange={(value: Date) => {
                                    onChange({
                                        ...filterRule,
                                        values: [
                                            moment(value)
                                                .utc()
                                                .startOf('month'),
                                        ],
                                    });
                                }}
                            />
                        );
                    case TimeInterval.YEAR:
                        return (
                            <YearInput
                                value={filterRule.values?.[0] || new Date()}
                                onChange={(value: Date) => {
                                    onChange({
                                        ...filterRule,
                                        values: [
                                            moment(value).utc().startOf('year'),
                                        ],
                                    });
                                }}
                            />
                        );
                    default:
                        break;
                }
            }
            return (
                <DateInput2
                    fill
                    defaultTimezone="UTC"
                    showTimezoneSelect={false}
                    value={
                        filterRule.values?.[0]
                            ? new Date(filterRule.values?.[0]).toUTCString()
                            : new Date().toUTCString()
                    }
                    timePrecision={isTimestamp ? 'millisecond' : undefined}
                    formatDate={(value: Date) =>
                        isTimestamp
                            ? formatTimestamp(moment(value).utc())
                            : formatDate(value)
                    }
                    parseDate={isTimestamp ? parseTimestamp : parseDate}
                    defaultValue={new Date()}
                    onChange={(value: string | null) => {
                        if (value) {
                            onChange({
                                ...filterRule,
                                values: [moment(value).utc()],
                            });
                        }
                    }}
                />
            );
        case FilterOperator.IN_THE_PAST:
            const parsedValue = parseInt(filterRule.values?.[0], 10);
            return (
                <MultipleInputsWrapper>
                    <NumericInput
                        fill
                        value={isNaN(parsedValue) ? undefined : parsedValue}
                        min={0}
                        onValueChange={(value) =>
                            onChange({
                                ...filterRule,
                                values: [value],
                            })
                        }
                    />
                    <UnitOfTimeAutoComplete
                        unitOfTime={
                            filterRule.settings?.unitOfTime || UnitOfTime.days
                        }
                        completed={filterRule.settings?.completed || false}
                        onChange={(value) =>
                            onChange({
                                ...filterRule,
                                settings: {
                                    unitOfTime: value.unitOfTime,
                                    completed: value.completed,
                                },
                            })
                        }
                    />
                </MultipleInputsWrapper>
            );
        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default DateFilterInputs;
