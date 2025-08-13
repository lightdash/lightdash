import { getTimezoneLabel, TimeZone } from '@lightdash/common';
import { MantineProvider, Select, type SelectProps } from '@mantine-8/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { getMantine8ThemeOverride } from '../../../mantine8Theme';

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
        <MantineProvider theme={getMantine8ThemeOverride()}>
            <Select
                variant="filled"
                maw={190}
                size="xs"
                placeholder="Select timezone"
                data={timeZoneOptions}
                {...props}
            />
        </MantineProvider>
    );
};

export default TimeZonePicker;
