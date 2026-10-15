import { getTimezoneLabel, TimeZone } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface TimeZonePickerProps extends Omit<SelectProps, 'data'> {}

const TimeZonePicker: FC<TimeZonePickerProps> = (props) => {
    const { t } = useTranslation('filters');
    const timeZoneOptions = useMemo(
        () =>
            Object.keys(TimeZone)
                .filter((key) => isNaN(Number(key)))
                .map((key) => {
                    const timezoneLabel = getTimezoneLabel(key) || key;
                    const labelText =
                        dayjs.tz.guess() === key
                            ? t('timeZonePicker.localOption', {
                                  label: timezoneLabel,
                              })
                            : timezoneLabel;

                    return { label: labelText, value: key };
                }),
        [t],
    );

    return (
        <Select
            variant="filled"
            maw={190}
            size="xs"
            placeholder={t('timeZonePicker.placeholder')}
            data={timeZoneOptions}
            {...props}
        />
    );
};

export default TimeZonePicker;
