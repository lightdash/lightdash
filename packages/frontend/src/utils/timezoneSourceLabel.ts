import {
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import i18n from '../i18n/i18n';

// Explains where a chart's resolved time zone came from, classifying its single
// `timezone` setting as project default / per-viewer / pinned override.
export const getTimezoneSourceLabel = (
    timezoneSetting: string | null | undefined,
    resolvedTimezone: string,
): string => {
    if (timezoneSetting === USER_TIMEZONE_SETTING) {
        return i18n.t('timezoneSource.viewer', {
            ns: 'app',
            timezone: resolvedTimezone,
        });
    }
    if (
        timezoneSetting &&
        timezoneSetting !== PROJECT_TIMEZONE_SETTING &&
        isTimeZone(timezoneSetting)
    ) {
        return i18n.t('timezoneSource.pinned', {
            ns: 'app',
            timezone: resolvedTimezone,
        });
    }
    return i18n.t('timezoneSource.project', {
        ns: 'app',
        timezone: resolvedTimezone,
    });
};
