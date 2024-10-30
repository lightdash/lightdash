import { getTimezoneLabel, TimeZone } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';

export interface TimeZonePickerProps extends Omit<SelectProps, 'data'> {}

const TimeZonePicker: FC<TimeZonePickerProps> = (props) => {
    const timeZoneOptions = useMemo(
        () =>
            Object.keys(TimeZone)
                .filter((key) => isNaN(Number(key)))
                .map((key) => {
                    let labelText = getTimezoneLabel(key) || key;

                    labelText =
                        dayjs.tz.guess() === key
                            ? `${labelText} - Local`
                            : labelText;

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
            data={timeZoneOptions}
            {...props}
        />
    );
};

export default TimeZonePicker;
