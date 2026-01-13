export type FunnelStep = {
    stepOrder: number;
    eventName: string;
};

// Date range presets matching common funnel analysis patterns
export const FUNNEL_DATE_PRESETS = [
    { value: 'last_7_days', label: 'Last 7 days', days: 7 },
    { value: 'last_14_days', label: 'Last 14 days', days: 14 },
    { value: 'last_30_days', label: 'Last 30 days', days: 30 },
    { value: 'last_90_days', label: 'Last 90 days', days: 90 },
    { value: 'last_6_months', label: 'Last 6 months', days: 180 },
    { value: 'last_12_months', label: 'Last 12 months', days: 365 },
    { value: 'custom', label: 'Custom range', days: null },
] as const;

export type FunnelDatePreset = typeof FUNNEL_DATE_PRESETS[number]['value'];

export type FunnelDateRange =
    | { type: 'preset'; preset: Exclude<FunnelDatePreset, 'custom'> }
    | { type: 'custom'; start: string; end: string }; // ISO date strings

export type FunnelQueryRequest = {
    exploreName: string;
    timestampFieldId: string;
    userIdFieldId: string;
    eventNameFieldId: string;
    steps: FunnelStep[];
    dateRange: FunnelDateRange;
    conversionWindow?: {
        value: number;
        unit: 'hours' | 'days' | 'weeks';
    };
    breakdownDimensionId?: string;
};

// Helper to resolve date range to start/end dates
export function resolveFunnelDateRange(dateRange: FunnelDateRange): {
    start: Date;
    end: Date;
} {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (dateRange.type === 'custom') {
        return {
            start: new Date(dateRange.start),
            end: new Date(dateRange.end),
        };
    }

    const preset = FUNNEL_DATE_PRESETS.find(
        (p) => p.value === dateRange.preset,
    );
    if (!preset || preset.days === null) {
        throw new Error(`Invalid preset: ${dateRange.preset}`);
    }

    const start = new Date();
    start.setDate(start.getDate() - preset.days);
    start.setHours(0, 0, 0, 0);

    return { start, end };
}

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
