// Every other feature is recorded in the ledger but never charged.
export const AI_BILLABLE_FEATURES = [
    'agent',
    'deep-research',
    'agent-subtask',
    'compaction',
    'data-app',
] as const;

export type AiBillableFeature = (typeof AI_BILLABLE_FEATURES)[number];

const BILLABLE_FEATURE_SET: ReadonlySet<string> = new Set(AI_BILLABLE_FEATURES);

export const isAiBillableFeature = (
    value: string,
): value is AiBillableFeature => BILLABLE_FEATURE_SET.has(value);

// Where the call's thread was created, never the request that continues it.
export const AI_USAGE_CHANNELS = [
    'web',
    'slack',
    'embed',
    'api',
    'mcp',
    'evals',
    'scheduler',
    'data_app',
] as const;

export type AiUsageChannel = (typeof AI_USAGE_CHANNELS)[number];

const USAGE_CHANNEL_SET: ReadonlySet<string> = new Set(AI_USAGE_CHANNELS);

export const isAiUsageChannel = (value: string): value is AiUsageChannel =>
    USAGE_CHANNEL_SET.has(value);
