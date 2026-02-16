import { TimeFrames } from '@lightdash/common';

export type CanvasTimeOption =
    | { type: 'calendar'; timeFrame: TimeFrames; label: string }
    | { type: 'rolling'; rollingDays: number; label: string };

export const DEFAULT_CANVAS_TIME_OPTIONS: CanvasTimeOption[] = [
    {
        type: 'calendar',
        timeFrame: TimeFrames.WEEK,
        label: 'Current week to date',
    },
    {
        type: 'calendar',
        timeFrame: TimeFrames.MONTH,
        label: 'Current month to date',
    },
    {
        type: 'calendar',
        timeFrame: TimeFrames.YEAR,
        label: 'Current year to date',
    },
    { type: 'rolling', rollingDays: 7, label: 'Last 7 days' },
    { type: 'rolling', rollingDays: 28, label: 'Last 28 days' },
];

export const DEFAULT_CANVAS_TIME_OPTION: CanvasTimeOption =
    DEFAULT_CANVAS_TIME_OPTIONS[1]; // Current month to date
