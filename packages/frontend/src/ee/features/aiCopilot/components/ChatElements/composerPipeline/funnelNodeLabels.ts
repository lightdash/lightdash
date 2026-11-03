import {
    assertUnreachable,
    interpolateUiString,
    type FunnelConversionWindowUnit,
    type FunnelDatePreset,
    type FunnelDateRange,
    type FunnelSourceQuery,
    type UiStringKey,
} from '@lightdash/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';

dayjs.extend(utc);

const DEFAULT_CONVERSION_WINDOW = { value: 30, unit: 'days' } as const;

const FUNNEL_METRIC_COLUMNS = [
    'total_users',
    'conversion_rate',
    'step_conversion_rate',
    'median_time_to_convert',
];

/** Per-step measures of a funnel result, plus breakdown_value when split. */
const funnelMetricColumnsOf = (query: FunnelSourceQuery) => [
    ...FUNNEL_METRIC_COLUMNS,
    ...(query.breakdownDimensionId ? ['breakdown_value'] : []),
];

/** The columns every funnel result carries, read by downstream nodes. */
export const funnelResultColumnsOf = (query: FunnelSourceQuery) => [
    'step_order',
    'step_name',
    ...funnelMetricColumnsOf(query),
];

export const sortedFunnelSteps = (query: FunnelSourceQuery) =>
    [...query.steps].sort((a, b) => a.stepOrder - b.stepOrder);

const WINDOW_UNIT_KEYS = {
    hours: {
        singular: 'aiAgent.composer.funnelNode.window.hours.singular',
        plural: 'aiAgent.composer.funnelNode.window.hours.plural',
    },
    days: {
        singular: 'aiAgent.composer.funnelNode.window.days.singular',
        plural: 'aiAgent.composer.funnelNode.window.days.plural',
    },
    weeks: {
        singular: 'aiAgent.composer.funnelNode.window.weeks.singular',
        plural: 'aiAgent.composer.funnelNode.window.weeks.plural',
    },
} as const satisfies Record<
    FunnelConversionWindowUnit,
    { singular: UiStringKey; plural: UiStringKey }
>;

const PRESET_KEYS = {
    last_7_days: 'aiAgent.composer.funnelNode.range.last7Days',
    last_14_days: 'aiAgent.composer.funnelNode.range.last14Days',
    last_30_days: 'aiAgent.composer.funnelNode.range.last30Days',
    last_90_days: 'aiAgent.composer.funnelNode.range.last90Days',
    last_6_months: 'aiAgent.composer.funnelNode.range.last6Months',
    last_12_months: 'aiAgent.composer.funnelNode.range.last12Months',
} as const satisfies Record<Exclude<FunnelDatePreset, 'custom'>, UiStringKey>;

const formatRangeDate = (iso: string) => dayjs.utc(iso).format('D MMM YYYY');

/** The conversion window as a phrase, e.g. "7 days". */
export const useWindowPhrase = () => {
    const getUiString = useUiStrings();
    return (query: FunnelSourceQuery) => {
        const { value, unit } =
            query.conversionWindow ?? DEFAULT_CONVERSION_WINDOW;
        const keys = WINDOW_UNIT_KEYS[unit];
        return interpolateUiString(
            getUiString(value === 1 ? keys.singular : keys.plural),
            { count: value },
        );
    };
};

export const useRangeLabel = () => {
    const getUiString = useUiStrings();
    return (dateRange: FunnelDateRange) => {
        switch (dateRange.type) {
            case 'preset':
                return getUiString(PRESET_KEYS[dateRange.preset]);
            case 'custom':
                return interpolateUiString(
                    getUiString('aiAgent.composer.funnelNode.range.custom'),
                    {
                        start: formatRangeDate(dateRange.start),
                        end: formatRangeDate(dateRange.end),
                    },
                );
            default:
                return assertUnreachable(dateRange, 'Unknown date range');
        }
    };
};

/** Who / When / Event: the three fields a funnel reads, with their role. */
export const useFunnelEventFields = () => {
    const getUiString = useUiStrings();
    return (query: FunnelSourceQuery) => [
        {
            prefix: getUiString('aiAgent.composer.funnelNode.who'),
            fieldId: query.userIdFieldId,
        },
        {
            prefix: getUiString('aiAgent.composer.funnelNode.when'),
            fieldId: query.timestampFieldId,
        },
        {
            prefix: getUiString('aiAgent.composer.funnelNode.event'),
            fieldId: query.eventNameFieldId,
        },
    ];
};

export type FunnelDetailsVariant = 'rows' | 'spine' | 'sentence';
