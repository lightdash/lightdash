import { type AiCreditKeyOrigin } from './types';

/**
 * Features whose calls count against an organisation's credits. Everything
 * else is recorded but never charged.
 */
export const AI_BILLABLE_FEATURES = [
    'agent',
    'deep-research',
    'agent-subtask',
    'compaction',
    'data-app',
] as const;

export type AiBillableFeature = (typeof AI_BILLABLE_FEATURES)[number];

const BILLABLE: ReadonlySet<string> = new Set(AI_BILLABLE_FEATURES);

export type AiUsageBillability = {
    feature: string;
    keyOrigin: AiCreditKeyOrigin | null;
    outcome: 'complete' | 'failed';
};

export const isAiUsageBillable = ({
    feature,
    keyOrigin,
    outcome,
}: AiUsageBillability): boolean =>
    keyOrigin === 'lightdash-managed' &&
    outcome === 'complete' &&
    BILLABLE.has(feature);
