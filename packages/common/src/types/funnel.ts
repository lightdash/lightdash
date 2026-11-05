import {
    EVENT_ANALYTICS_DATE_PRESETS,
    resolveEventAnalyticsDateRange,
    type EventAnalyticsDatePreset,
    type EventAnalyticsDateRange,
    type EventAnalyticsQueryBase,
} from './eventAnalytics';

export type FunnelStep = {
    stepOrder: number;
    eventName: string;
};

export const FUNNEL_DATE_PRESETS = EVENT_ANALYTICS_DATE_PRESETS;

export type FunnelDatePreset = EventAnalyticsDatePreset;

export type FunnelDateRange = EventAnalyticsDateRange;

export type FunnelConversionWindowUnit = 'hours' | 'days' | 'weeks';

export type FunnelQueryRequest = EventAnalyticsQueryBase & {
    steps: FunnelStep[];
    conversionWindow?: {
        value: number;
        unit: FunnelConversionWindowUnit;
    };
};

export const resolveFunnelDateRange = resolveEventAnalyticsDateRange;

export type FunnelStepResult = {
    stepOrder: number;
    stepName: string;
    totalUsers: number;
    conversionRate: number; // From step 1 (overall)
    stepConversionRate: number; // From previous step
    medianTimeToConvertSeconds: number | null; // null for step 1
    breakdownValue?: string; // If breakdown dimension selected
};

export type FunnelQueryResult = {
    steps: FunnelStepResult[];
    sql: string; // For debugging
};

export type ApiFunnelEventNamesResponse = {
    status: 'ok';
    results: string[];
};

export type ApiFunnelQueryResponse = {
    status: 'ok';
    results: FunnelQueryResult;
};
