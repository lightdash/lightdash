import { TimeFrames } from '@lightdash/common';
import { type TFunction } from 'i18next';

export type CanvasTimeOption =
    | { type: 'calendar'; timeFrame: TimeFrames }
    | { type: 'rolling'; rollingDays: number };

export const DEFAULT_CANVAS_TIME_OPTIONS: CanvasTimeOption[] = [
    { type: 'calendar', timeFrame: TimeFrames.WEEK },
    { type: 'calendar', timeFrame: TimeFrames.MONTH },
    { type: 'calendar', timeFrame: TimeFrames.YEAR },
    { type: 'rolling', rollingDays: 7 },
    { type: 'rolling', rollingDays: 28 },
];

export const DEFAULT_CANVAS_TIME_OPTION: CanvasTimeOption =
    DEFAULT_CANVAS_TIME_OPTIONS[1]; // Current month to date

export const getCanvasTimeOptionLabel = (
    t: TFunction,
    option: CanvasTimeOption,
): string => {
    if (option.type === 'rolling') {
        return t('canvasTimeFrame.lastDays', { count: option.rollingDays });
    }
    switch (option.timeFrame) {
        case TimeFrames.WEEK:
            return t('canvasTimeFrame.currentWeekToDate');
        case TimeFrames.MONTH:
            return t('canvasTimeFrame.currentMonthToDate');
        case TimeFrames.YEAR:
            return t('canvasTimeFrame.currentYearToDate');
        default:
            return t('canvasTimeFrame.currentPeriodToDate');
    }
};
