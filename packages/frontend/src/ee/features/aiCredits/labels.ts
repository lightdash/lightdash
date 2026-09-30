import {
    isAiBillableFeature,
    isAiUsageChannel,
    type AiBillableFeature,
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
