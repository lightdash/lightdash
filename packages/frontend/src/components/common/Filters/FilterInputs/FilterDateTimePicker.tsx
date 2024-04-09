import { Group, Text } from '@mantine/core';
import {
    DateTimePicker,
    type DateTimePickerProps,
    type DayOfWeek,
} from '@mantine/dates';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';

import { type FC } from 'react';

dayjs.extend(timezone);

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
    showTimezone?: boolean;
}

const FilterDateTimePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    showTimezone = true,
    ...rest
}) => {
    const displayFormat = 'YYYY-MM-DD HH:mm:ss';

    return (
        <Group noWrap spacing="xs" align="start">
            {/* // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
            // @ts-ignore */}
            <DateTimePicker
                w="100%"
                size="xs"
                miw={185}
                valueFormat={displayFormat}
                {...rest}
                popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
                firstDayOfWeek={firstDayOfWeek}
                value={value}
                onChange={(date) => {
                    if (!date) return;
                    onChange(date);
                }}
                inputWrapperOrder={['input', 'description']}
                description={
                    <Text ml="two">
                        UTC time: {value?.toUTCString().replace('GMT', '')}
                    </Text>
                }
            />
            {showTimezone && (
                <Text size="xs" color="dimmed" mt={7}>
                    {dayjs.tz.guess()}
                </Text>
            )}
        </Group>
    );
};

export default FilterDateTimePicker;
