import { NumericInput } from '@blueprintjs/core';
import { DateInput2 } from '@blueprintjs/datetime2';
import {
    DateFilterRule,
    DimensionType,
    FilterOperator,
    formatDate,
    isDimension,
    parseDate,
    TimeInterval,
    UnitOfTime,
} from '@lightdash/common';
import moment from 'moment';
import { FC } from 'react';
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
                                            values: [moment(value).utc(true)],
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
                                                .utc(true)
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
                                            moment(value)
                                                .utc(true)
                                                .startOf('year'),
                                        ],
                                    });
                                }}
                            />
                        );
                    default:
                        break;
                }
            }

            if (isTimestamp) {
                return (
                    <DateInput2
                        fill
                        defaultTimezone="UTC"
                        showTimezoneSelect={false}
                        value={
                            filterRule.values?.[0]
                                ? new Date(filterRule.values?.[0]).toString()
                                : new Date().toString()
                        }
                        timePrecision={'millisecond'}
                        formatDate={(value: Date) =>
                            moment(value).format(`YYYY-MM-DD, HH:mm:ss:SSS`)
                        }
                        parseDate={(value) =>
                            moment(value, `YYYY-MM-DD, HH:mm:ss:SSS`).toDate()
                        }
                        defaultValue={new Date().toString()}
                        onChange={(value: string | null) => {
                            if (value) {
                                onChange({
                                    ...filterRule,
                                    values: [value],
                                });
                            }
                        }}
                        popoverProps={{
                            placement: 'bottom',
                        }}
                    />
                );
            }
            return (
                <DateInput2
                    fill
                    value={
                        filterRule.values?.[0]
                            ? new Date(filterRule.values?.[0]).toUTCString()
                            : new Date().toUTCString()
                    }
                    formatDate={(value: Date) =>
                        formatDate(moment(value).utc(true))
                    }
                    parseDate={parseDate}
                    defaultValue={new Date().toString()}
                    onChange={(value: string | null) => {
                        if (value) {
                            onChange({
                                ...filterRule,
                                values: [moment(value).utc(true)],
                            });
                        }
                    }}
                    popoverProps={{
                        placement: 'bottom',
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
