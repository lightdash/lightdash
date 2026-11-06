import type { EventAnalyticsQueryBase } from './eventAnalytics';

export type FunnelStep = {
    stepOrder: number;
    eventName: string;
};

export type FunnelConversionWindowUnit = 'hours' | 'days' | 'weeks';

export type FunnelQueryRequest = EventAnalyticsQueryBase & {
    steps: FunnelStep[];
    conversionWindow?: {
        value: number;
        unit: FunnelConversionWindowUnit;
    };
};

export type FunnelStepResult = {
    stepOrder: number;
    stepName: string;
    totalUsers: number;
    /** Percentage of step 1 users */
    conversionRate: number;
    /** Percentage of previous step users */
    stepConversionRate: number;
    /** Null for step 1 */
    medianTimeToConvertSeconds: number | null;
    breakdownValue?: string;
};

export type FunnelQueryResult = {
    steps: FunnelStepResult[];
    /** The SQL that produced the result, for debugging */
    sql: string;
    /** Warehouse round trip, in milliseconds */
    durationMs: number;
};

export type ApiFunnelQueryResponse = {
    status: 'ok';
    results: FunnelQueryResult;
};
