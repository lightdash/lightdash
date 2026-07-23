import { Group, Text } from '@mantine-8/core';
import { type DateTimePickerProps, type DayOfWeek } from '@mantine-8/dates';
import dayjs from 'dayjs';
import { useEffect, useState, type FC } from 'react';
import FilterDateTimePicker from './FilterDateTimePicker';
import styles from './FilterDateTimeRangePicker.module.css';

interface Props extends Omit<
    DateTimePickerProps,
    | 'firstDayOfWeek'
    | 'getDayProps'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'minDate'
    | 'maxDate'
> {
    startValue: Date | null;
    endValue: Date | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
    invalidStartValue?: string;
    invalidEndValue?: string;
}

const FilterDateTimeRangePicker: FC<Props> = ({
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

    useEffect(() => {
        setDate1(startValue);
    }, [startValue]);

    useEffect(() => {
        setDate2(endValue);
    }, [endValue]);

    return (
        <Group wrap="nowrap" align="start" w="100%" gap="xs">
            <FilterDateTimePicker
                size="xs"
                withSeconds
                disabled={disabled}
                placeholder="Start date"
                showTimezone={false}
                maxDate={
                    date2
                        ? dayjs(date2).subtract(1, 'second').toDate()
                        : undefined
                }
                firstDayOfWeek={firstDayOfWeek}
                invalidValue={invalidStartValue}
                {...rest}
                value={date1}
                onChange={(newDate) => {
                    if (!date2 || dayjs(newDate).isBefore(dayjs(date2))) {
                        setDate1(newDate);

                        if (newDate && date2) {
                            onChange([newDate, date2]);
                        }
                    }
                }}
            />

            <Text c="dimmed" mt={7} className={styles.noWrap} fz="xs">
                –
            </Text>

            <FilterDateTimePicker
                size="xs"
                withSeconds
                disabled={disabled}
                placeholder="End date"
                minDate={
                    date1 ? dayjs(date1).add(1, 'second').toDate() : undefined
                }
                firstDayOfWeek={firstDayOfWeek}
                invalidValue={invalidEndValue}
                {...rest}
                value={date2}
                onChange={(newDate) => {
                    if (!date1 || dayjs(newDate).isAfter(dayjs(date1))) {
                        setDate2(newDate);
                        if (newDate && date1) {
                            onChange([date1, newDate]);
                        }
                    }
                }}
            />
        </Group>
    );
};

export default FilterDateTimeRangePicker;
