import { Flex, Text } from '@mantine-8/core';
import { type DateInputProps, type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import FilterDatePicker from './FilterDatePicker';
import styles from './FilterDateRangePicker.module.css';

interface Props extends Omit<
    DateInputProps,
    'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
> {
    startValue: Date | null;
    endValue: Date | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
    invalidStartValue?: string;
    invalidEndValue?: string;
}

const FilterDateRangePicker: FC<Props> = ({
    startValue,
    endValue,
    disabled,
    firstDayOfWeek,
    onChange,
    invalidStartValue,
    invalidEndValue,
    ...rest
}) => {
    const [date1, setDate1] = useState(startValue);
    const [date2, setDate2] = useState(endValue);

    return (
        <Flex align="center" w="100%" gap="xxs">
            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder="Start date"
                maxDate={
                    date2 ? dayjs(date2).subtract(1, 'day').toDate() : undefined
                }
                firstDayOfWeek={firstDayOfWeek}
                invalidValue={invalidStartValue}
                {...rest}
                value={date1}
                onChange={(newDate) => {
                    setDate1(newDate);

                    if (newDate && date2) {
                        onChange([newDate, date2]);
                    }
                }}
            />

            <Text c="dimmed" className={styles.noWrap} fz="xs">
                –
            </Text>

            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder="End date"
                minDate={dayjs(date1).add(1, 'day').toDate()}
                firstDayOfWeek={firstDayOfWeek}
                invalidValue={invalidEndValue}
                {...rest}
                value={date2}
                onChange={(newDate) => {
                    setDate2(newDate);

                    if (newDate && date1) {
                        onChange([date1, newDate]);
                    }
                }}
            />
        </Flex>
    );
};

export default FilterDateRangePicker;
