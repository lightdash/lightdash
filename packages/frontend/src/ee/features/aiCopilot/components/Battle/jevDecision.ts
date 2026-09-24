import { assertUnreachable, type AiAgentJevDecision } from '@lightdash/common';
import { formatDurationMs } from '../../utils/responseTiming';

const EDIT_LABELS: Record<string, string> = {
    chart_type: 'chart type',
    filter_values: 'filter',
    filter_period: 'date range',
    add_field: 'breakdown',
    sort: 'sort',
    clear_filters: 'clear filters',
    clear_sort: 'clear sort',
    stack: 'stack',
    unstack: 'unstack',
    swap_axes: 'swap axes',
    split_series: 'split series',
    compound: 'multi-step edit',
    undo: 'undo',
};

const editLabel = (decision: AiAgentJevDecision) =>
    decision.editKind === null
        ? 'edit'
        : (EDIT_LABELS[decision.editKind] ?? decision.editKind);

type JevDecisionSummary = {
    applied: boolean;
    label: string;
    detail: string;
};

const handoff = (label: string, detail: string): JevDecisionSummary => ({
    applied: false,
    label: `Agent · ${label}`,
    detail,
});

export const describeJevDecision = (
    decision: AiAgentJevDecision,
): JevDecisionSummary => {
    const took = `JEV decided in ${formatDurationMs(decision.latencyMs)}.`;
    if (decision.applied)
        return {
            applied: true,
            label: `Instant ${editLabel(decision)}`,
            detail: `${took} It applied the ${editLabel(decision)} directly and skipped the agent model.`,
        };
    switch (decision.outcome) {
        case 'routed':
        case 'not_an_edit':
            return handoff(
                'new question',
                `${took} It read this as a new question and handed it to the agent.`,
            );
        case 'clarify':
            return handoff(
                'clarifying',
                `${took} The request was ambiguous, so the agent asked a follow-up.`,
            );
        case 'unresolved':
            return handoff(
                'JEV unsure',
                `${took} It could not resolve the edit${decision.reason ? ` (${decision.reason})` : ''}, so the agent took the turn.`,
            );
        case 'unavailable':
            return handoff(
                'JEV unavailable',
                'JEV did not answer in time, so the agent took the turn.',
            );
        case 'intent':
        case 'compound':
        case 'needs_values':
            return handoff(
                `${editLabel(decision)} fallback`,
                `${took} It resolved a ${editLabel(decision)} but handed it to the agent${decision.fallbackReason ? ` (${decision.fallbackReason})` : ''}.`,
            );
        default:
            return assertUnreachable(decision.outcome, 'Unknown JEV outcome');
    }
};
