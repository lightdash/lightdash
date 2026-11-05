import {
    type EventAnalyticsDatePreset,
    type EventNamesRequest,
    type Filters,
} from '@lightdash/common';
import { buildEventDateRange } from './dateRange';

export type EventNamesConfig = {
    exploreName: string | null;
    eventNameFieldId: string | null;
    timestampFieldId: string | null;
    dateRangePreset: EventAnalyticsDatePreset;
    customDateRange: [string | null, string | null];
    filters: Filters;
};

/** Builds the event names request, or null while the configuration is incomplete. */
export function buildEventNamesRequest(
    config: EventNamesConfig,
): EventNamesRequest | null {
    const dateRange = buildEventDateRange(
        config.dateRangePreset,
        config.customDateRange,
    );
    if (
        !config.exploreName ||
        !config.eventNameFieldId ||
        !config.timestampFieldId ||
        !dateRange
    ) {
        return null;
    }
    return {
        exploreName: config.exploreName,
        eventNameFieldId: config.eventNameFieldId,
        timestampFieldId: config.timestampFieldId,
        dateRange,
        filters: config.filters,
    };
}
