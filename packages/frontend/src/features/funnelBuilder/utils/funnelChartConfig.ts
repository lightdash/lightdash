import {
    type EventAnalyticsDatePreset,
    type Filters,
    type FunnelConversionWindowUnit,
    type FunnelQueryRequest,
    type FunnelStep,
    type FunnelStepResult,
} from '@lightdash/common';
import { buildEventDateRange } from '../../eventAnalytics/utils/dateRange';

export type FunnelConfig = {
    projectUuid: string;
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    breakdownDimensionId: string | null;
    steps: FunnelStep[];
    dateRangePreset: EventAnalyticsDatePreset;
    customDateRange: [string | null, string | null];
    filters: Filters;
    conversionWindowValue: number;
    conversionWindowUnit: FunnelConversionWindowUnit;
};

/** Builds the API request, or null while the configuration is incomplete. */
export function buildFunnelQueryRequest(
    config: FunnelConfig,
): FunnelQueryRequest | null {
    if (
        !config.projectUuid ||
        !config.exploreName ||
        !config.timestampFieldId ||
        !config.userIdFieldId ||
        !config.eventNameFieldId
    ) {
        return null;
    }
    const steps = config.steps.filter((step) => step.eventName);
    if (steps.length < 2) return null;

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
        steps,
        dateRange,
        filters: config.filters,
        conversionWindow: {
            value: config.conversionWindowValue,
            unit: config.conversionWindowUnit,
        },
    };
}

/** Formats a duration as the largest whole unit, for example "3h". */
export function formatTimeDuration(seconds: number | null | undefined): string {
    if (seconds == null) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}

/** Tooltip body for a step: users, step conversion, and overall conversion. */
export function formatStepTooltipLabel(step: FunnelStepResult): string {
    const rows = [
        ['Users', step.totalUsers.toLocaleString()],
        ['Conversion', `${step.stepConversionRate.toFixed(1)}%`],
        ['Overall', `${step.conversionRate.toFixed(1)}%`],
    ];
    const rowsHtml = rows
        .map(
            ([label, value]) =>
                `<tr><td style="color:#888;padding-right:12px">${label}</td><td style="text-align:right;font-weight:600">${value}</td></tr>`,
        )
        .join('');
    return `<table style="border-spacing:0;line-height:1.6">${rowsHtml}</table>`;
}

/** Bar label in ECharts rich text: step conversion over user count. */
export function formatFunnelBarLabel(step: FunnelStepResult): string {
    return `{percent|${step.stepConversionRate.toFixed(
        1,
    )}%}\n{count|${step.totalUsers.toLocaleString()}}`;
}

export const funnelBarLabelRichStyles = {
    percent: {
        fontSize: 13,
        fontWeight: 'bold' as const,
        color: '#fff',
    },
    count: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.7)',
    },
};
