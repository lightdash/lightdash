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
        title: 'This chart uses Python',
        body: 'The agent wrote and ran Python code for one of these steps. You get the custom calculation without writing any code.',
    },
    merge: {
        title: 'Built from trusted metrics',
        body: 'One of these steps combines or reshapes the results of earlier steps. The agent works from your trusted metrics instead of writing its own database queries.',
    },
    default: {
        title: 'Every step behind this chart',
        body: "Each box is a query the agent ran. A line means one step uses another step's result.",
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
    scope,
    queries,
    terminalNodeId,
    saveInMenu,
    canAddToChat,
}: {
    /** Selector of the panel the tour belongs to; every target is looked up inside it. */
    scope: string;
    queries: SourceQuery[];
    terminalNodeId: string;
    /** The panel menu offers saving to a dashboard. */
    saveInMenu: boolean;
    canAddToChat: boolean;
}): GuidedTourStep[] => {
    const focus = getTourFocus(queries, terminalNodeId);
    return [
        {
            target: `${scope} ${TARGETS.viewToggle}`,
            title: 'See how this chart was built',
            body: 'Open Lineage to see every step the agent ran. The steps run outside the chat, so their results stay out of your conversation.',
        },
        {
            target: `${scope} ${TARGETS.graph}`,
            ...GRAPH_COPY[focus.highlight],
        },
        {
            target: `${scope} ${TARGETS.steps} [data-node-id="${CSS.escape(focus.nodeId)}"]`,
            ...(canAddToChat
                ? {
                      title: 'Check or question any step',
                      body: 'Each step shows what it ran and the rows it returned. Click Add to chat to ask the agent about a step.',
                  }
                : {
                      title: 'Check any step',
                      body: 'Each step shows what it ran and the rows it returned, so you can check the numbers behind the chart.',
                  }),
        },
        {
            title: 'Save to a dashboard',
            ...(saveInMenu
                ? {
                      target: `${scope} ${TARGETS.actions}`,
                      body: 'Save this chart to a dashboard from this menu, or ask the agent to save it.',
                  }
                : {
                      target: null,
                      body: 'Ask the agent to save this chart to a dashboard.',
                  }),
        },
    ];
};
