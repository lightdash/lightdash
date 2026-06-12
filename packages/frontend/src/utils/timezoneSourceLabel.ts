import {
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';

// Explains where a chart's resolved time zone came from, classifying its single
// `timezone` setting as project default / per-viewer / pinned override.
export const getTimezoneSourceLabel = (
    timezoneSetting: string | null | undefined,
    resolvedTimezone: string,
): string => {
    if (timezoneSetting === USER_TIMEZONE_SETTING) {
        return `This chart follows each viewer's own time zone. You're seeing it in ${resolvedTimezone}.`;
    }
    if (
        timezoneSetting &&
        timezoneSetting !== PROJECT_TIMEZONE_SETTING &&
        isTimeZone(timezoneSetting)
    ) {
        return `This chart is pinned to ${resolvedTimezone} and won't follow the project time zone.`;
    }
    return `This chart resolves in the project time zone (${resolvedTimezone}).`;
};
