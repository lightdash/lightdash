// Every other feature is recorded in the ledger but never charged.
export const AI_BILLABLE_FEATURES = [
    'agent',
    'deep-research',
    'agent-subtask',
    'compaction',
    'data-app',
] as const;

export type AiBillableFeature = (typeof AI_BILLABLE_FEATURES)[number];
