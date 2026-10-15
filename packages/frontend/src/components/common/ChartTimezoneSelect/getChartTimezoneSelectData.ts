import {
    PROJECT_TIMEZONE_SETTING,
    TimeZone,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { type TFunction } from 'i18next';

export type ChartTimezoneSelectGroup = {
    group: string;
    items: { value: string; label: string }[];
};

// Grouped options for the chart timezone dropdown. Labels here are the compact
// form shown in the closed control; the open list adds the UTC offset and the
// resolved project zone via the Select's renderOption.
export const getChartTimezoneSelectData = (
    localTimezone: string | undefined,
    t: TFunction<'commonUi'>,
): ChartTimezoneSelectGroup[] => {
    const specificZones = Object.keys(TimeZone)
        .filter((key) => isNaN(Number(key)))
        .map((key) => {
            const name = key.replaceAll('_', ' ');
            const label =
                key === localTimezone
                    ? t('chartTimezoneSelect.localZone', { zone: name })
                    : name;
            return { value: key, label };
        });

    return [
        {
            group: t('chartTimezoneSelect.defaultGroup'),
            items: [
                {
                    value: PROJECT_TIMEZONE_SETTING,
                    label: t('chartTimezoneSelect.projectTimezone'),
                },
                {
                    value: USER_TIMEZONE_SETTING,
                    label: t('chartTimezoneSelect.userTimezone'),
                },
            ],
        },
        {
            group: t('chartTimezoneSelect.specificGroup'),
            items: specificZones,
        },
    ];
};
