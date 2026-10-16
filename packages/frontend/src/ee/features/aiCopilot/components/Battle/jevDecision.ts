import {
    assertUnreachable,
    type AiAgentJevChoice,
    type AiAgentJevDecision,
} from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

const EDIT_LABEL_KEYS: Record<string, string> = {
    chart_type: 'chartType',
    filter_values: 'filterValues',
    filter_period: 'filterPeriod',
    add_field: 'addField',
    sort: 'sort',
    remove_filter: 'removeFilter',
    filter_number: 'filterNumber',
    filter_boolean: 'filterBoolean',
    filter_text: 'filterText',
    filter_blank: 'filterBlank',
    acknowledgement: 'acknowledgement',
    show_query: 'showQuery',
    download_help: 'downloadHelp',
    add_metric: 'addMetric',
    remove_metric: 'removeMetric',
    swap_metric: 'swapMetric',
    remove_field: 'removeField',
    swap_field: 'swapField',
    change_grain: 'changeGrain',
    clear_filters: 'clearFilters',
    clear_sort: 'clearSort',
    stack: 'stack',
    unstack: 'unstack',
    swap_axes: 'swapAxes',
    split_series: 'splitSeries',
    compound: 'compound',
    undo: 'undo',
    rename_document: 'renameDocument',
    rename_chart: 'renameChart',
    remove_chart: 'removeChart',
    move_chart: 'moveChart',
};

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`battle.jev.${key}`, { ns: 'aiCopilotAdmin', ...options });

const editLabel = (decision: AiAgentJevDecision) =>
    decision.editKind === null
        ? tr('defaultEdit')
        : EDIT_LABEL_KEYS[decision.editKind]
          ? tr(`editKinds.${EDIT_LABEL_KEYS[decision.editKind]}`)
          : decision.editKind;

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
    badge: tr('agentBadge', { badge }),
    title,
    description,
    reasonCode,
});

/** JEV answered the turn itself, with an edit or its own question, so the agent model never ran. */
export const isJevTurn = (decision: AiAgentJevDecision) =>
    decision.applied || decision.outcome === 'clarify';

export const describeJevDecision = (
    decision: AiAgentJevDecision,
    name = 'JEV',
): JevDecisionSummary => {
    const edit = editLabel(decision);
    if (decision.applied)
        return {
            applied: true,
            badge: tr('applied.badge', { name, edit }),
            title: tr('applied.title', { name, edit }),
            description: tr('applied.description', { name }),
            reasonCode: null,
        };
    switch (decision.outcome) {
        case 'routed':
        case 'not_an_edit':
            return handoff(
                tr('routed.badge'),
                tr('routed.title'),
                tr('routed.description', { name }),
            );
        case 'clarify':
            return {
                applied: true,
                badge: tr('clarify.badge', { name }),
                title: tr('clarify.title', { name }),
                description: tr('clarify.description', { name }),
                reasonCode: null,
            };
        case 'unresolved':
            return handoff(
                tr('unresolved.badge', { name }),
                tr('unresolved.title', { name }),
                tr('unresolved.description', { name }),
                decision.reason,
            );
        case 'instant_reply':
            return {
                applied: true,
                badge: tr('instantReply.badge', { name, edit }),
                title: tr('instantReply.title', { name }),
                description: tr('instantReply.description', { name }),
                reasonCode: null,
            };
        case 'unavailable':
            return handoff(
                tr('unavailable.badge', { name }),
                tr('unavailable.title', { name }),
                tr('unavailable.description', { name }),
            );
        case 'intent':
        case 'compound':
        case 'needs_values':
            return handoff(
                edit,
                tr('handedOff.title', { name, edit }),
                tr('handedOff.description', { name, edit }),
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
