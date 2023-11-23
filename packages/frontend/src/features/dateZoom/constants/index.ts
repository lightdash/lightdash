import { TimeFrames } from '@lightdash/common';

export const DATE_ZOOM_OPTIONS = [
    // TODO: add support for these times
    {
        value: TimeFrames.DAY,
        label: 'Day',
    },
    {
        value: TimeFrames.MONTH,
        label: 'Month',
    },
    {
        value: TimeFrames.QUARTER,
        label: 'Quarter',
    },
    {
        value: TimeFrames.YEAR,
        label: 'Year',
    },
];
