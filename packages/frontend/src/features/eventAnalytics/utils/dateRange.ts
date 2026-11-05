import {
    type EventAnalyticsDatePreset,
    type EventAnalyticsDateRange,
} from '@lightdash/common';

/** Builds the request date range, or null while a custom range is incomplete. */
export function buildEventDateRange(
    preset: EventAnalyticsDatePreset,
    customRange: [string | null, string | null],
): EventAnalyticsDateRange | null {
    if (preset !== 'custom') {
        return { type: 'preset', preset };
    }
    if (customRange[0] && customRange[1]) {
        return { type: 'custom', start: customRange[0], end: customRange[1] };
    }
    return null;
}
