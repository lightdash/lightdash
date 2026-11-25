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
        body: 'See how each step feeds into your chart. The agent can run Python for custom calculations and analysis, with no coding required.',
    },
    merge: {
        title: 'Flexible analysis, governed data',
        body: 'See how each step feeds into your chart. The agent can combine and reshape trusted results instead of pulling raw, unverified data.',
    },
    default: {
        title: 'How each step connects',
        body: 'Follow how each step builds toward your final chart. Breaking complex questions into steps lets the agent work cleanly from your trusted data.',
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

/** The step the tour points at: the first Python step, else the first merge, else the final one. */
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

/** Step index from which the panel shows the lineage view. */
export const COMPOSER_LINEAGE_TOUR_LINEAGE_FROM = 1;

export const getComposerLineageTourSteps = ({
    queries,
    terminalNodeId,
    saveInMenu,
    canAddToChat,
}: {
    queries: SourceQuery[];
    terminalNodeId: string;
    /** The panel menu offers saving to a dashboard. */
    saveInMenu: boolean;
    canAddToChat: boolean;
}): GuidedTourStep[] => {
    const focus = getTourFocus(queries, terminalNodeId);
    return [
        {
            target: TARGETS.viewToggle,
            title: 'See how this was built',
            body: 'Switch to Lineage to trace every step behind this answer. Complex analysis runs separately so your chat stays focused, no code needed.',
        },
        {
            target: TARGETS.graph,
            ...GRAPH_COPY[focus.highlight],
        },
        {
            target: `${TARGETS.steps} [data-node-id="${CSS.escape(focus.nodeId)}"]`,
            ...(canAddToChat
                ? {
                      title: 'Check or question any step',
                      body: 'Each step shows what it did and its result table. Use Add to chat on any step to ask follow-up questions.',
                  }
                : {
                      title: 'Check any step',
                      body: 'Each step shows what it did and its result table, so you can verify the numbers behind the chart.',
                  }),
        },
        {
            title: 'Save to a dashboard',
            ...(saveInMenu
                ? {
                      target: TARGETS.actions,
                      body: 'Add the chart to a dashboard from this menu, or just ask the agent to save it for you.',
                  }
                : {
                      target: null,
                      body: 'To keep this chart, just ask the agent in chat to save it for you.',
                  }),
        },
    ];
};
