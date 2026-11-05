import {
    RETENTION_MAX_PERIODS,
    type EventAnalyticsDatePreset,
    type EventAnalyticsDateRange,
    type Filters,
    type RetentionCohortType,
    type RetentionCriteria,
    type RetentionMode,
    type RetentionQueryRequest,
    type RetentionUnit,
} from '@lightdash/common';

export type RetentionConfig = {
    projectUuid: string;
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    breakdownDimensionId: string | null;
    bornEvent: string | null;
    returnEvent: string | null;
    cohortType: RetentionCohortType;
    unit: RetentionUnit;
    periods: number;
    criteria: RetentionCriteria;
    mode: RetentionMode;
    dateRangePreset: EventAnalyticsDatePreset;
    customDateRange: [string | null, string | null];
    filters: Filters;
};

function buildEventDateRange(
    preset: EventAnalyticsDatePreset,
    customRange: [string | null, string | null],
): EventAnalyticsDateRange | null {
    if (preset === 'custom') {
        if (customRange[0] && customRange[1]) {
            return {
                type: 'custom',
                start: customRange[0],
                end: customRange[1],
            };
        }
        return null;
    }
    return { type: 'preset', preset };
}

/** Build the API request, or null when the configuration is incomplete. */
export function buildRetentionQueryRequest(
    config: RetentionConfig,
): RetentionQueryRequest | null {
    if (
        !config.projectUuid ||
        !config.exploreName ||
        !config.timestampFieldId ||
        !config.userIdFieldId ||
        !config.eventNameFieldId ||
        !config.bornEvent
    ) {
        return null;
    }
    if (
        !Number.isInteger(config.periods) ||
        config.periods < 1 ||
        config.periods > RETENTION_MAX_PERIODS[config.unit]
    ) {
        return null;
    }
    const dateRange = buildEventDateRange(
        config.dateRangePreset,
        config.customDateRange,
    );
    if (!dateRange) return null;

    return {
        exploreName: config.exploreName,
        timestampFieldId: config.timestampFieldId,
        userIdFieldId: config.userIdFieldId,
        eventNameFieldId: config.eventNameFieldId,
        breakdownDimensionId: config.breakdownDimensionId ?? undefined,
        dateRange,
        filters: config.filters,
        bornEvent: config.bornEvent,
        returnEvent: config.returnEvent,
        cohortType: config.cohortType,
        unit: config.unit,
        periods: config.periods,
        criteria: config.criteria,
        mode: config.mode,
    };
}

export const RETENTION_UNIT_OPTIONS: { value: RetentionUnit; label: string }[] =
    [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
    ];

export const RETENTION_COHORT_TYPE_OPTIONS: {
    value: RetentionCohortType;
    label: string;
    description: string;
}[] = [
    {
        value: 'first_time',
        label: 'First time',
        description: 'Users join the cohort when they first do the event',
    },
    {
        value: 'recurring',
        label: 'Recurring',
        description: 'Users join a cohort every period they do the event',
    },
];

export const RETENTION_CRITERIA_OPTIONS: {
    value: RetentionCriteria;
    label: string;
    description: string;
}[] = [
    {
        value: 'on',
        label: 'On',
        description: 'Returned during that exact period',
    },
    {
        value: 'on_or_after',
        label: 'On or after',
        description: 'Returned during that period or any later one',
    },
];

export const RETENTION_MODE_OPTIONS: {
    value: RetentionMode;
    label: string;
    description: string;
}[] = [
    {
        value: 'calendar',
        label: 'Calendar',
        description: 'Periods are calendar buckets after the birth bucket',
    },
    {
        value: 'rolling',
        label: 'Rolling',
        description: 'Periods are measured from each user’s birth event',
    },
];

export const formatRetentionRate = (rate: number | null): string =>
    rate === null ? '—' : `${rate.toFixed(1)}%`;

/** Mixpanel-style purple shading, intensity relative to the row maximum. */
export const getRetentionCellColor = (
    rate: number | null,
    rowMax: number,
): string => {
    if (rate === null || rowMax <= 0) return 'transparent';
    const intensity = Math.min(1, rate / rowMax);
    return `rgba(99, 102, 241, ${0.08 + intensity * 0.72})`;
};
