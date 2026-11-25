import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';

const TARGETS = {
    viewToggle: '[data-tour="composer-view-toggle"]',
    graph: '[data-tour="composer-lineage-graph"]',
    steps: '[data-tour="composer-lineage-steps"]',
    actions: '[data-tour="composer-quick-actions"]',
} as const;

type Highlight = 'python' | 'merge' | 'default';

const GRAPH_COPY: Record<Highlight, { title: string; body: string }> = {
    python: {
        title: 'This answer uses Python',
        body: 'See how each step feeds into your chart. The agent can run Python for custom calculations and analysis.',
    },
    merge: {
        title: 'Flexible analysis, governed data',
        body: 'See how each step feeds into your chart. The agent can combine and reshape governed query results instead of reaching for raw SQL.',
    },
    default: {
        title: 'How each step connects',
        body: 'Follow how each step builds toward your final chart. Breaking complex questions into steps lets the agent handle one part of the analysis at a time.',
    },
};

const highlightOf = (query: SourceQuery): Highlight | null => {
    switch (query.sourceType) {
        case QuerySourceType.PYTHON:
            return 'python';
        case QuerySourceType.DUCKDB:
        case QuerySourceType.MERGE:
            return 'merge';
        default:
            return null;
    }
};

const getTourFocus = (
    queries: SourceQuery[],
    terminalNodeId: string,
): { nodeId: string; highlight: Highlight } => {
    for (const highlight of ['python', 'merge'] as const) {
        const nodeId = queries.find(
            (query) => highlightOf(query) === highlight,
        )?.nodeId;
        if (nodeId) return { nodeId, highlight };
    }
    return { nodeId: terminalNodeId, highlight: 'default' };
};

/** Where the last step sends the user to save; null drops the step. */
export type ComposerLineageTourSave = 'menu' | 'agent' | null;

const SAVE_STEP: Record<'menu' | 'agent', (scope: string) => GuidedTourStep> = {
    menu: (scope) => ({
        target: `${scope} ${TARGETS.actions}`,
        title: 'Save to a dashboard',
        body: 'Add the chart to a dashboard from this menu, or just ask the agent to save it for you.',
    }),
    agent: () => ({
        target: null,
        title: 'Save to a dashboard',
        body: 'To keep this chart, just ask the agent in chat to save it for you.',
    }),
};

/** Step index from which the panel shows the lineage view. */
export const COMPOSER_LINEAGE_TOUR_LINEAGE_FROM = 1;

export const getComposerLineageTourSteps = ({
    scope,
    queries,
    terminalNodeId,
    save,
    canAddToChat,
}: {
    /** Selector of the panel the tour belongs to; every target is looked up inside it. */
    scope: string;
    queries: SourceQuery[];
    terminalNodeId: string;
    save: ComposerLineageTourSave;
    canAddToChat: boolean;
}): GuidedTourStep[] => {
    const focus = getTourFocus(queries, terminalNodeId);
    return [
        {
            target: `${scope} ${TARGETS.viewToggle}`,
            title: 'See how this was built',
            body: 'Switch to Lineage to trace every step behind this answer.',
        },
        {
            target: `${scope} ${TARGETS.graph}`,
            ...GRAPH_COPY[focus.highlight],
        },
        {
            target: `${scope} ${TARGETS.steps} [data-node-id="${CSS.escape(focus.nodeId)}"]`,
            ...(canAddToChat
                ? {
                      title: 'Check any step',
                      body: 'Each step shows what it did and its result table. Use Add to chat on any step to ask follow-up questions.',
                  }
                : {
                      title: 'Check any step',
                      body: 'Each step shows what it did and its result table, so you can verify the numbers behind the chart.',
                  }),
        },
        ...(save ? [SAVE_STEP[save](scope)] : []),
    ];
};
