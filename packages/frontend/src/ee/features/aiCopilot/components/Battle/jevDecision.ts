import {
    assertUnreachable,
    type AiAgentJevChoice,
    type AiAgentJevDecision,
} from '@lightdash/common';

const EDIT_LABELS: Record<string, string> = {
    chart_type: 'chart type',
    filter_values: 'filter',
    filter_period: 'date range',
    add_field: 'breakdown',
    sort: 'sort',
    remove_filter: 'filter removal',
    filter_number: 'threshold filter',
    filter_boolean: 'yes/no filter',
    filter_text: 'text match',
    filter_blank: 'blank filter',
    acknowledgement: 'quick reply',
    show_query: 'query summary',
    download_help: 'download help',
    add_metric: 'metric addition',
    remove_metric: 'metric removal',
    swap_metric: 'metric swap',
    remove_field: 'breakdown removal',
    swap_field: 'breakdown swap',
    change_grain: 'time grain change',
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

/** JEV answered the turn itself, with an edit or its own question, so the agent model never ran. */
export const isJevTurn = (decision: AiAgentJevDecision) =>
    decision.applied || decision.outcome === 'clarify';

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
            return {
                applied: true,
                badge: 'JEV · clarifying question',
                title: 'JEV asked which one you meant',
                description:
                    'The request fit more than one option about equally, so JEV offered the choices instead of guessing. The agent model did not run.',
                reasonCode: null,
            };
        case 'unresolved':
            return handoff(
                'JEV unsure',
                'JEV was not confident',
                'JEV looked for a direct chart edit but was not sure enough to apply one, so the agent took over.',
                decision.reason,
            );
        case 'instant_reply':
            return {
                applied: true,
                badge: `JEV · ${edit}`,
                title: 'JEV answered directly',
                description:
                    'This was a small follow-up JEV could answer from the chart itself, so the agent model did not run.',
                reasonCode: null,
            };
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

// An API node from before choices existed omits the field during a rolling deploy.
export const getJevChoices = (
    decision: AiAgentJevDecision | null,
): AiAgentJevChoice[] => decision?.choices ?? [];
