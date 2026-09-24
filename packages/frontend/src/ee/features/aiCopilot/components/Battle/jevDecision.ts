import { assertUnreachable, type AiAgentJevDecision } from '@lightdash/common';

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
    badge: string;
    title: string;
    description: string;
    /** Machine reason from the decision, shown as-is for debugging. */
    reasonCode: string | null;
};

const handoff = (
    badge: string,
    title: string,
    description: string,
    reasonCode: string | null = null,
): JevDecisionSummary => ({
    applied: false,
    badge: `Agent · ${badge}`,
    title,
    description,
    reasonCode,
});

export const describeJevDecision = (
    decision: AiAgentJevDecision,
): JevDecisionSummary => {
    const edit = editLabel(decision);
    if (decision.applied)
        return {
            applied: true,
            badge: `JEV · ${edit}`,
            title: `JEV applied the ${edit}`,
            description:
                'JEV changed the chart directly, so the agent model never ran and spent no tokens.',
            reasonCode: null,
        };
    switch (decision.outcome) {
        case 'routed':
        case 'not_an_edit':
            return handoff(
                'new question',
                'New question for the agent',
                'JEV read this as a new question rather than a change to the current chart, so the agent answered it.',
            );
        case 'clarify':
            return handoff(
                'clarifying',
                'Needs clarification',
                'The request could mean more than one thing, so the agent asked a follow-up.',
            );
        case 'unresolved':
            return handoff(
                'JEV unsure',
                'JEV was not confident',
                'JEV looked for a direct chart edit but was not sure enough to apply one, so the agent took over.',
                decision.reason,
            );
        case 'unavailable':
            return handoff(
                'JEV unavailable',
                'JEV did not answer',
                'JEV did not respond in time, so the agent handled the turn as usual.',
            );
        case 'intent':
        case 'compound':
        case 'needs_values':
            return handoff(
                edit,
                `JEV passed the ${edit} to the agent`,
                `JEV worked out the ${edit} but it needed more than a direct edit, so the agent finished it.`,
                decision.fallbackReason,
            );
        default:
            return assertUnreachable(decision.outcome, 'Unknown JEV outcome');
    }
};
