import { Flex, Text } from '@mantine/core';
import { DateTimePickerProps, DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { FC, useMemo, useState } from 'react';
import { getDateValueFromUnknown } from './dateUtils';
import FilterDateTimePicker from './FilterDateTimePicker';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: [unknown, unknown] | null;
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
    const initialDate1 = useMemo(
        () => getDateValueFromUnknown(value?.[0]),
        [value],
    );
    const initialDate2 = useMemo(
        () => getDateValueFromUnknown(value?.[1]),
        [value],
    );

    const [date1, setDate1] = useState(initialDate1);
    const [date2, setDate2] = useState(initialDate2);

    return (
        <Flex align="center" w="100%" gap="xs">
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

            <Text color="dimmed">–</Text>

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
