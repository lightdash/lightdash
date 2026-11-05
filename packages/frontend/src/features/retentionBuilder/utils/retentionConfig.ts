import {
    RETENTION_MAX_PERIODS,
    type EventAnalyticsDatePreset,
    type Filters,
    type RetentionCohortType,
    type RetentionCriteria,
    type RetentionMode,
    type RetentionQueryRequest,
    type RetentionUnit,
} from '@lightdash/common';
import { buildEventDateRange } from '../../eventAnalytics/utils/dateRange';

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

/** Builds the API request, or null while the configuration is incomplete. */
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
        description:
            'A user joins one cohort: the period they first did the event',
    },
    {
        value: 'recurring',
        label: 'Recurring',
        description:
            'A user joins a cohort for every period they did the event',
    },
];

export const RETENTION_CRITERIA_OPTIONS: {
    value: RetentionCriteria;
    label: string;
    description: string;
}[] = [
    {
        value: 'on',
        label: 'In the period',
        description: 'Counted in a period only if they came back during it',
    },
    {
        value: 'on_or_after',
        label: 'In or after the period',
        description: 'Counted in a period if they came back during it or later',
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
        description:
            'Day 1 is the next calendar day, week 1 the next calendar week',
    },
    {
        value: 'rolling',
        label: 'Rolling',
        description: 'Day 1 is 24 to 48 hours after each user’s first event',
    },
];

export const formatRetentionRate = (rate: number | null): string =>
    rate === null ? '—' : `${rate.toFixed(1)}%`;

/** Cell shading, with intensity relative to the row maximum. */
export const getRetentionCellColor = (
    rate: number | null,
    rowMax: number,
): string => {
    if (rate === null || rowMax <= 0) return 'transparent';
    const intensity = Math.min(1, rate / rowMax);
    return `rgba(99, 102, 241, ${0.08 + intensity * 0.72})`;
};
