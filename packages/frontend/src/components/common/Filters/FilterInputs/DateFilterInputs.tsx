import {
    DimensionType,
    FilterOperator,
    formatDate,
    isDimension,
    isField,
    isFilterRule,
    parseDate,
    TimeFrames,
    type ConditionalRule,
    type DateFilterRule,
} from '@lightdash/common';
import { Flex, NumberInput, Text } from '@mantine/core';
import dayjs from 'dayjs';
import { type FilterInputsProps } from '.';
import { useFiltersContext } from '../FiltersProvider';
import { getFirstDayOfWeek } from '../utils/filterDateUtils';
import { getPlaceholderByFilterTypeAndOperator } from '../utils/getPlaceholderByFilterTypeAndOperator';
import DefaultFilterInputs from './DefaultFilterInputs';
import FilterDatePicker from './FilterDatePicker';
import FilterDateRangePicker from './FilterDateRangePicker';
import FilterDateTimePicker from './FilterDateTimePicker';
import FilterDateTimeRangePicker from './FilterDateTimeRangePicker';
import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import FilterUnitOfTimeAutoComplete from './FilterUnitOfTimeAutoComplete';
import FilterWeekPicker from './FilterWeekPicker';
import FilterYearPicker from './FilterYearPicker';

const DateFilterInputs = <T extends ConditionalRule = DateFilterRule>(
    props: FilterInputsProps<T>,
) => {
    const { field, rule, onChange, popoverProps, disabled, filterType } = props;
    const { startOfWeek } = useFiltersContext();
    const isTimestamp =
        isField(field) && field.type === DimensionType.TIMESTAMP;

    if (!isFilterRule(rule)) {
        throw new Error('DateFilterInputs expects a FilterRule');
    }

    const placeholder = getPlaceholderByFilterTypeAndOperator({
        type: filterType,
        operator: rule.operator,
        disabled: rule.disabled && !rule.values,
    });

    switch (rule.operator) {
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
            if (isDimension(field) && field.timeInterval) {
                switch (field.timeInterval.toUpperCase()) {
                    case TimeFrames.WEEK:
                        return (
                            <Flex align="center" gap="xs" w="100%">
                                <Text
                                    color="dimmed"
                                    sx={{ whiteSpace: 'nowrap' }}
                                    size="xs"
                                >
                                    week commencing
                                </Text>

                                <FilterWeekPicker
                                    placeholder={placeholder}
                                    disabled={disabled}
                                    value={
                                        rule.values && rule.values[0]
                                            ? parseDate(
                                                  formatDate(
                                                      rule.values[0],
                                                      TimeFrames.WEEK,
                                                  ),
                                                  TimeFrames.WEEK,
                                              )
                                            : null
                                    }
                                    // FIXME: mantine v7
                                    // mantine does not set the first day of the week based on the locale
                                    // so we need to do it manually and always pass it as a prop
                                    firstDayOfWeek={getFirstDayOfWeek(
                                        startOfWeek,
                                    )}
                                    popoverProps={popoverProps}
                                    onChange={(value: Date | null) => {
                                        onChange({
                                            ...rule,
                                            values: value
                                                ? [
                                                      formatDate(
                                                          value,
                                                          TimeFrames.WEEK,
                                                      ),
                                                  ]
                                                : [],
                                        });
                                    }}
                                />
                            </Flex>
                        );
                    case TimeFrames.MONTH:
                        return (
                            <FilterMonthAndYearPicker
                                disabled={disabled}
                                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                                // @ts-ignore
                                placeholder={placeholder}
                                popoverProps={popoverProps}
                                value={
                                    rule.values && rule.values[0]
                                        ? parseDate(
                                              formatDate(
                                                  rule.values[0],
                                                  TimeFrames.MONTH,
                                              ),
                                              TimeFrames.MONTH,
                                          )
                                        : null
                                }
                                onChange={(value: Date) => {
                                    onChange({
                                        ...rule,
                                        values: [
                                            formatDate(value, TimeFrames.MONTH),
                                        ],
                                    });
                                }}
                            />
                        );
                    case TimeFrames.YEAR:
                        return (
                            <FilterYearPicker
                                disabled={disabled}
                                // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                                // @ts-ignore
                                placeholder={placeholder}
                                popoverProps={popoverProps}
                                value={
                                    rule.values && rule.values[0]
                                        ? parseDate(
                                              formatDate(
                                                  rule.values[0],
                                                  TimeFrames.YEAR,
                                              ),
                                              TimeFrames.YEAR,
                                          )
                                        : null
                                }
                                onChange={(newDate: Date) => {
                                    onChange({
                                        ...rule,
                                        values: [
                                            formatDate(
                                                newDate,
                                                TimeFrames.YEAR,
                                            ),
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
                // For display only

                let value =
                    rule.values && rule.values[0]
                        ? dayjs(rule?.values?.[0]).toDate()
                        : dayjs().toDate(); // Create

                return (
                    <FilterDateTimePicker
                        disabled={disabled}
                        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                        // @ts-ignore
                        placeholder={placeholder}
                        withSeconds
                        // FIXME: mantine v7
                        // mantine does not set the first day of the week based on the locale
                        // so we need to do it manually and always pass it as a prop
                        firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                        popoverProps={popoverProps}
                        value={value}
                        onChange={(v: Date | null) => {
                            onChange({
                                ...rule,
                                // format as an ISO string, not for display
                                values: v === null ? [] : [dayjs(v).format()],
                            });
                        }}
                    />
                );
            }

            return (
                <FilterDatePicker
                    disabled={disabled}
                    placeholder={placeholder}
                    // FIXME: mantine v7
                    // mantine does not set the first day of the week based on the locale
                    // so we need to do it manually and always pass it as a prop
                    firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                    popoverProps={popoverProps}
                    value={
                        rule.values
                            ? parseDate(
                                  formatDate(rule.values[0], TimeFrames.DAY),
                                  TimeFrames.DAY,
                              )
                            : null
                    }
                    onChange={(value: Date | null) => {
                        onChange({
                            ...rule,
                            values: value
                                ? [formatDate(value, TimeFrames.DAY)]
                                : [],
                        });
                    }}
                />
            );
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            const parsedValue = parseInt(rule.values?.[0], 10);
            return (
                <Flex gap="xs" w="100%">
                    <NumberInput
                        size="xs"
                        sx={{ flexShrink: 1, flexGrow: 1 }}
                        placeholder={placeholder}
                        disabled={disabled}
                        value={isNaN(parsedValue) ? undefined : parsedValue}
                        min={0}
                        onChange={(value) => {
                            onChange({
                                ...rule,
                                values: value === '' ? [] : [value],
                            });
                        }}
                    />

                    <FilterUnitOfTimeAutoComplete
                        disabled={disabled}
                        sx={{ flexShrink: 0, flexGrow: 3 }}
                        isTimestamp={isTimestamp}
                        unitOfTime={rule.settings?.unitOfTime}
                        completed={rule.settings?.completed || false}
                        withinPortal={popoverProps?.withinPortal}
                        onDropdownOpen={popoverProps?.onOpen}
                        onDropdownClose={popoverProps?.onClose}
                        onChange={(value) =>
                            onChange({
                                ...rule,
                                settings: {
                                    unitOfTime: value.unitOfTime,
                                    completed: value.completed,
                                },
                            })
                        }
                    />
                </Flex>
            );
        case FilterOperator.IN_THE_CURRENT:
            return (
                <FilterUnitOfTimeAutoComplete
                    w="100%"
                    disabled={disabled}
                    isTimestamp={isTimestamp}
                    unitOfTime={rule.settings?.unitOfTime}
                    showOptionsInPlural={false}
                    showCompletedOptions={false}
                    completed={false}
                    withinPortal={popoverProps?.withinPortal}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={(value) =>
                        onChange({
                            ...rule,
                            settings: {
                                unitOfTime: value.unitOfTime,
                                completed: false,
                            },
                        })
                    }
                />
            );
        case FilterOperator.IN_BETWEEN:
            if (isTimestamp) {
                return (
                    <FilterDateTimeRangePicker
                        disabled={disabled}
                        firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                        value={
                            rule.values && rule.values[0] && rule.values[1]
                                ? [
                                      dayjs(rule.values[0]).toDate(),
                                      dayjs(rule.values[1]).toDate(),
                                  ]
                                : null
                        }
                        popoverProps={popoverProps}
                        onChange={(value: [Date, Date] | null) => {
                            onChange({
                                ...rule,
                                values: value
                                    ? [
                                          dayjs(value[0]).format(),
                                          dayjs(value[1]).format(),
                                      ]
                                    : [],
                            });
                        }}
                    />
                );
            }

            return (
                <FilterDateRangePicker
                    disabled={disabled}
                    firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                    value={
                        rule.values && rule.values[0] && rule.values[1]
                            ? [
                                  parseDate(
                                      formatDate(
                                          rule.values[0],
                                          TimeFrames.DAY,
                                      ),
                                      TimeFrames.DAY,
                                  ),
                                  parseDate(
                                      formatDate(
                                          rule.values[1],
                                          TimeFrames.DAY,
                                      ),
                                      TimeFrames.DAY,
                                  ),
                              ]
                            : null
                    }
                    popoverProps={popoverProps}
                    onChange={(value: [Date, Date] | null) => {
                        onChange({
                            ...rule,
                            values: value
                                ? [
                                      formatDate(value[0], TimeFrames.DAY),
                                      formatDate(value[1], TimeFrames.DAY),
                                  ]
                                : [],
                        });
                    }}
                />
            );
        default: {
            return <DefaultFilterInputs {...props} />;
        }
    }
};

export default DateFilterInputs;
