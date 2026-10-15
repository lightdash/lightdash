import {
    assertUnreachable,
    isAiBillableFeature,
    isAiUsageChannel,
    type AiBillableFeature,
    type AiCreditDailyUsageSeries,
    type AiCreditUsageBreakdown,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`labels.${key}`, { ns: 'eeMisc', ...options });

const FEATURE_KEYS: Record<AiBillableFeature, string> = {
    agent: 'agent',
    'agent-subtask': 'agentSubtask',
    compaction: 'compaction',
    'deep-research': 'deepResearch',
    'data-app': 'dataApp',
};

// Calls recorded before the channel was tracked have no channel.
const otherLabel = () => tr('other');

export const getAiCreditFeatureLabel = (key: string): string =>
    isAiBillableFeature(key)
        ? tr(`features.${FEATURE_KEYS[key]}`)
        : otherLabel();

export const getAiCreditChannelLabel = (key: string): string =>
    isAiUsageChannel(key) ? tr(`channels.${key}`) : otherLabel();

export const getAiCreditBreakdownLabel = (
    breakdown: AiCreditUsageBreakdown,
): string => tr(`breakdowns.${breakdown}`);

const getUnattributedLabel = (breakdown: AiCreditUsageBreakdown): string => {
    switch (breakdown) {
        case 'feature':
        case 'channel':
            return otherLabel();
        case 'user':
        case 'project':
        case 'agent':
            return tr(`unattributed.${breakdown}`);
        default:
            return assertUnreachable(
                breakdown,
                `Unknown AI credit usage breakdown ${breakdown}`,
            );
    }
};

const getValueLabel = (
    breakdown: AiCreditUsageBreakdown,
    key: string,
    name: string | null,
): string => {
    if (name !== null) return name;
    return breakdown === 'channel'
        ? getAiCreditChannelLabel(key)
        : getAiCreditFeatureLabel(key);
};

export const getAiCreditSeriesLabel = (
    breakdown: AiCreditUsageBreakdown,
    series: AiCreditDailyUsageSeries,
): string => {
    switch (series.type) {
        case 'value':
            return getValueLabel(breakdown, series.key, series.name);
        case 'other':
            return otherLabel();
        case 'deleted':
            return tr(`deleted.${breakdown}`);
        case 'embeddedViewers':
            return tr('embeddedViewers');
        case 'unattributed':
            return getUnattributedLabel(breakdown);
        default:
            return assertUnreachable(series, 'Unknown AI credit usage series');
    }
};
