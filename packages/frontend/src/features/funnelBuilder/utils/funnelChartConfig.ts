import {
    type FunnelDatePreset,
    type FunnelDateRange,
    type FunnelQueryRequest,
    type FunnelStep,
    type FunnelStepResult,
} from '@lightdash/common';

/**
 * Check if funnel configuration is valid for running a query.
 */
export function canRunFunnelQuery(config: {
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    steps: FunnelStep[];
    dateRangePreset: FunnelDatePreset;
    customDateRange: [Date | null, Date | null];
}): boolean {
    const hasRequiredFields =
        config.exploreName &&
        config.timestampFieldId &&
        config.userIdFieldId &&
        config.eventNameFieldId;

    const hasEnoughSteps = config.steps.filter((s) => s.eventName).length >= 2;

    const hasValidDateRange =
        config.dateRangePreset !== 'custom' ||
        (config.customDateRange[0] !== null &&
            config.customDateRange[1] !== null);

    return !!(hasRequiredFields && hasEnoughSteps && hasValidDateRange);
}

/**
 * Build date range object from preset or custom range.
 */
export function buildDateRange(
    preset: FunnelDatePreset,
    customRange: [Date | null, Date | null],
): FunnelDateRange {
    if (preset === 'custom' && customRange[0] && customRange[1]) {
        return {
            type: 'custom',
            start: customRange[0].toISOString(),
            end: customRange[1].toISOString(),
        };
    }
    return {
        type: 'preset',
        preset: preset === 'custom' ? 'last_30_days' : preset,
    };
}

/**
 * Build FunnelQueryRequest from state values.
 */
export function buildFunnelQueryRequest(config: {
    exploreName: string;
    timestampFieldId: string;
    userIdFieldId: string;
    eventNameFieldId: string;
    steps: FunnelStep[];
    dateRange: FunnelDateRange;
    conversionWindowValue: number;
    conversionWindowUnit: 'hours' | 'days' | 'weeks';
    breakdownDimensionId: string | null;
}): FunnelQueryRequest {
    return {
        exploreName: config.exploreName,
        timestampFieldId: config.timestampFieldId,
        userIdFieldId: config.userIdFieldId,
        eventNameFieldId: config.eventNameFieldId,
        steps: config.steps.filter((s) => s.eventName),
        dateRange: config.dateRange,
        conversionWindow: {
            value: config.conversionWindowValue,
            unit: config.conversionWindowUnit,
        },
        breakdownDimensionId: config.breakdownDimensionId ?? undefined,
    };
}

/**
 * Format time duration for display.
 */
export function formatTimeDuration(seconds: number | null | undefined): string {
    if (seconds == null) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
}

/**
 * Format step info for tooltip as an HTML table.
 * Shows total users, step conversion, and overall conversion.
 */
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

/**
 * Format bar label content for a funnel step.
 * Uses ECharts rich text format for styling.
 */
export function formatFunnelBarLabel(step: FunnelStepResult): string {
    return `{percent|${step.stepConversionRate.toFixed(
        1,
    )}%}\n{count|${step.totalUsers.toLocaleString()}}`;
}

/**
 * Rich text styles for funnel bar labels.
 */
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
