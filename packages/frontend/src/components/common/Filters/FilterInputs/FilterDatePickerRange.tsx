import { Flex, Text } from '@mantine/core';
import { DateInputProps, DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { FC, useMemo, useState } from 'react';
import { getDateValueFromUnknown } from './dateUtils';
import FilterDatePicker from './FilterDatePicker';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: [unknown, unknown] | null;
    onChange: (value: [Date, Date] | null) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterDatePickerRange: FC<Props> = ({
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
            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder="Start date"
                maxDate={dayjs(date2).subtract(1, 'day').toDate()}
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

            <FilterDatePicker
                size="xs"
                disabled={disabled}
                placeholder="End date"
                minDate={dayjs(date1).add(1, 'day').toDate()}
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

export default FilterDatePickerRange;
