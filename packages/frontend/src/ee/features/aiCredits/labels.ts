import {
    assertUnreachable,
    isAiBillableFeature,
    isAiUsageChannel,
    type AiBillableFeature,
    type AiCreditDailyUsageSeries,
    type AiCreditUsageBreakdown,
    type AiUsageChannel,
} from '@lightdash/common';

const FEATURE_LABELS: Record<AiBillableFeature, string> = {
    agent: 'Ask AI',
    'agent-subtask': 'Ask AI Tool',
    compaction: 'Compaction',
    'deep-research': 'Deep Research',
    'data-app': 'Data App',
};

const CHANNEL_LABELS: Record<AiUsageChannel, string> = {
    web: 'Web app',
    slack: 'Slack',
    embed: 'Embedded',
    api: 'API',
    mcp: 'MCP',
    evals: 'Evals',
    scheduler: 'Scheduled deliveries',
    data_app: 'Data apps',
};

// Calls recorded before the channel was tracked have no channel.
const OTHER_LABEL = 'Other';

export const getAiCreditFeatureLabel = (key: string): string =>
    isAiBillableFeature(key) ? FEATURE_LABELS[key] : OTHER_LABEL;

export const getAiCreditChannelLabel = (key: string): string =>
    isAiUsageChannel(key) ? CHANNEL_LABELS[key] : OTHER_LABEL;

const BREAKDOWN_LABELS: Record<AiCreditUsageBreakdown, string> = {
    feature: 'Feature',
    channel: 'Channel',
    user: 'User',
    project: 'Project',
    agent: 'Agent',
};

export const getAiCreditBreakdownLabel = (
    breakdown: AiCreditUsageBreakdown,
): string => BREAKDOWN_LABELS[breakdown];

const getUnattributedLabel = (breakdown: AiCreditUsageBreakdown): string => {
    switch (breakdown) {
        case 'feature':
        case 'channel':
            return OTHER_LABEL;
        case 'user':
            return 'No user';
        case 'project':
            return 'No project';
        case 'agent':
            return 'No agent';
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
            return 'Other';
        case 'deleted':
            return `Deleted ${getAiCreditBreakdownLabel(breakdown).toLowerCase()}`;
        case 'embeddedViewers':
            return 'Embedded viewers';
        case 'unattributed':
            return getUnattributedLabel(breakdown);
        default:
            return assertUnreachable(series, 'Unknown AI credit usage series');
    }
};
