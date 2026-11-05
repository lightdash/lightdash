import type { Filters } from './filter';

// Date range presets shared by the event analytics query builders (funnel, retention)
export const EVENT_ANALYTICS_DATE_PRESETS = [
    { value: 'last_7_days', label: 'Last 7 days', days: 7 },
    { value: 'last_14_days', label: 'Last 14 days', days: 14 },
    { value: 'last_30_days', label: 'Last 30 days', days: 30 },
    { value: 'last_90_days', label: 'Last 90 days', days: 90 },
    { value: 'last_6_months', label: 'Last 6 months', days: 180 },
    { value: 'last_12_months', label: 'Last 12 months', days: 365 },
    { value: 'custom', label: 'Custom range', days: null },
] as const;

export type EventAnalyticsDatePreset =
    (typeof EVENT_ANALYTICS_DATE_PRESETS)[number]['value'];

export type EventAnalyticsDateRange =
    | { type: 'preset'; preset: Exclude<EventAnalyticsDatePreset, 'custom'> }
    | { type: 'custom'; start: string; end: string }; // ISO date strings

export function resolveEventAnalyticsDateRange(
    dateRange: EventAnalyticsDateRange,
    now: Date = new Date(),
): {
    start: Date;
    end: Date;
} {
    if (dateRange.type === 'custom') {
        return {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
        };
    }

    const preset = EVENT_ANALYTICS_DATE_PRESETS.find(
        (p) => p.value === dateRange.preset,
    );
    if (!preset || preset.days === null) {
        throw new Error(`Invalid preset: ${dateRange.preset}`);
    }

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setDate(start.getDate() - preset.days);
    start.setHours(0, 0, 0, 0);

    return { start, end };
}

/**
 * How an explore maps onto an event stream. Every event analytics query
 * (funnel, retention) is built on top of this mapping.
 */
export type EventAnalyticsFieldMapping = {
    exploreName: string;
    timestampFieldId: string;
    userIdFieldId: string;
    eventNameFieldId: string;
};

/**
 * Shared request shape for the event analytics query builders.
 * `filters` uses the same payload as `MetricQuery.filters` so that dashboard
 * filters can be pushed down to these queries unchanged.
 */
export type EventAnalyticsQueryBase = EventAnalyticsFieldMapping & {
    dateRange: EventAnalyticsDateRange;
    filters?: Filters;
    breakdownDimensionId?: string;
};
