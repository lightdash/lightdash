import { Flex, Text } from '@mantine/core';
import { DateTimePickerProps, DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { FC, useState } from 'react';
import FilterDateTimePicker from './FilterDateTimePicker';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: [Date, Date] | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterDateTimeRangePicker: FC<Props> = ({
    value,
    disabled,
    firstDayOfWeek,
    onChange,
    ...rest
}) => {
    const [date1, setDate1] = useState(value?.[0] ?? null);
    const [date2, setDate2] = useState(value?.[1] ?? null);

    return (
        <Flex align="center" w="100%" gap="xxs">
            <FilterDateTimePicker
                size="xs"
                disabled={disabled}
                placeholder="Start date"
                maxDate={
                    date2 ? dayjs(date2).subtract(1, 'day').toDate() : undefined
                }
                firstDayOfWeek={firstDayOfWeek}
                {...rest}
                value={date1}
                onChange={(newDate) => {
                    setDate1(newDate);

                    if (newDate && date2) {
                        onChange([newDate, date2]);
                    }
                }}
            />

            <Text color="dimmed" sx={{ whiteSpace: 'nowrap' }} size="xs">
                –
            </Text>

            <FilterDateTimePicker
                size="xs"
                disabled={disabled}
                placeholder="End date"
                minDate={
                    date1 ? dayjs(date1).add(1, 'day').toDate() : undefined
                }
                firstDayOfWeek={firstDayOfWeek}
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

export default FilterDateTimeRangePicker;
