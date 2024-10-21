import { TimeZone } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';

export interface TimeZonePickerProps extends Omit<SelectProps, 'data'> {
    selectedTimezone?: string;
}

const TimeZonePicker: FC<TimeZonePickerProps> = ({
    onChange,
    selectedTimezone,
    ...rest
}) => {
    const timeZoneOptions = useMemo(
        () =>
            Object.keys(TimeZone)
                .filter((key) => isNaN(Number(key)))
                .map((key) => {
                    const labelText =
                        dayjs.tz.guess() === key ? `${key} (Local)` : key;
                    return { label: labelText, value: key };
                }),
        [],
    );

    return (
        <Select
            variant="filled"
            maw={190}
            size="xs"
            placeholder="Select timezone"
            value={selectedTimezone}
            data={timeZoneOptions}
            onChange={onChange}
            {...rest}
        />
    );
};

export default TimeZonePicker;
