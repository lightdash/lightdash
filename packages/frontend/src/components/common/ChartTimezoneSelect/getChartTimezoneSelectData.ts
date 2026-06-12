import {
    PROJECT_TIMEZONE_SETTING,
    TimeZone,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';

export type ChartTimezoneSelectGroup = {
    group: string;
    items: { value: string; label: string }[];
};

// Grouped options for the chart timezone dropdown. Labels here are the compact
// form shown in the closed control; the open list adds the UTC offset and the
// resolved project zone via the Select's renderOption. The per-viewer option is
// only offered when user timezones are enabled.
export const getChartTimezoneSelectData = (
    localTimezone: string | undefined,
    includeUserTimezone: boolean,
): ChartTimezoneSelectGroup[] => {
    const specificZones = Object.keys(TimeZone)
        .filter((key) => isNaN(Number(key)))
        .map((key) => {
            const name = key.replaceAll('_', ' ');
            const label = key === localTimezone ? `${name} - Local` : name;
            return { value: key, label };
        });

    return [
        {
            group: 'Default',
            items: [
                { value: PROJECT_TIMEZONE_SETTING, label: 'Project timezone' },
                ...(includeUserTimezone
                    ? [{ value: USER_TIMEZONE_SETTING, label: 'User timezone' }]
                    : []),
            ],
        },
        {
            group: 'Specific timezone',
            items: specificZones,
        },
    ];
};
