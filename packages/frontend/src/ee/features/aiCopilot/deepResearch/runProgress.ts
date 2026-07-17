import {
    assertUnreachable,
    countDeepResearchFindings,
    type AiDeepResearchActivity,
    type AiDeepResearchBudget,
    type AiDeepResearchEffort,
    type AiDeepResearchEvent,
    type AiDeepResearchPhase,
    type AiDeepResearchRun,
} from '@lightdash/common';
import {
    DEEP_RESEARCH_DEPTHS,
    type DeepResearchDepth,
    type DeepResearchRunRegistration,
    type DeepResearchRunStatus,
    type DeepResearchRunView,
} from './types';

export const DEEP_RESEARCH_DEPTH_CONFIG: Record<
    DeepResearchDepth,
    {
        label: string;
        effort: AiDeepResearchEffort;
        duration: string;
        warehouseQueries: number;
        description: string;
    }
> = {
    quick: {
        label: 'Low',
        effort: 'low',
        duration: 'Up to 15 minutes',
        warehouseQueries: 10,
        description: 'A focused check of the strongest available evidence.',
    },
    standard: {
        label: 'Medium',
        effort: 'medium',
        duration: 'Up to 30 minutes',
        warehouseQueries: 25,
        description:
            'A balanced investigation with validation and alternatives.',
    },
    deep: {
        label: 'High',
        effort: 'high',
        duration: 'Up to 45 minutes',
        warehouseQueries: 50,
        description: 'A broad investigation with more competing explanations.',
    },
    exhaustive: {
        label: 'Extra High',
        effort: 'xhigh',
        duration: 'Up to 55 minutes',
        warehouseQueries: 100,
        description: 'The widest evidence review for high-stakes questions.',
    },
};

const getActivityLabel = (activity: AiDeepResearchActivity | null): string => {
    switch (activity) {
        case 'lightdash_metadata':
            return 'Reviewed project data and metric definitions';
        case 'warehouse_query':
            return 'Executed a warehouse query';
        case 'web_search':
            return 'Searched public evidence sources';
        case 'web_fetch':
            return 'Reviewed a source document';
        case 'reporting':
            return 'Prepared the evidence-backed report';
        case null:
            return 'Updated the investigation';
        default:
            return assertUnreachable(activity, 'Unknown research activity');
    }
};

const getEventLabel = (event: AiDeepResearchEvent): string => {
    switch (event.eventType) {
        case 'status_changed':
            return `Research ${event.payload.status.replaceAll('_', ' ')}`;
        case 'cancellation_requested':
            return 'Cancellation requested';
        case 'progress':
            return getActivityLabel(event.payload.progress.activity);
        default:
            return assertUnreachable(event, 'Unknown research event');
    }
};

const getPhaseLabel = (
    phase: AiDeepResearchPhase | null,
    activity: AiDeepResearchActivity | null,
): string | null => {
    switch (phase) {
        case 'planning':
            return 'Planning the investigation';
        case 'investigating':
            return activity === 'warehouse_query'
                ? 'Testing explanations'
                : 'Gathering context';
        case 'validating':
            return activity === 'web_fetch'
                ? 'Reviewing evidence'
                : 'Validating findings';
        case 'synthesizing':
            return 'Writing the report';
        case null:
            return null;
        default:
            return assertUnreachable(phase, 'Unknown research phase');
    }
};

export const isDeepResearchRunTerminal = (
    status: DeepResearchRunStatus,
): boolean =>
    [
        'completed',
        'partially_completed',
        'failed',
        'cancelled',
        'waiting_for_permission',
        'waiting_for_reconnection',
    ].includes(status);

/** The budget is a pure function of depth, so it round-trips a run's depth. */
const getDepthFromBudget = (budget: AiDeepResearchBudget): DeepResearchDepth =>
    DEEP_RESEARCH_DEPTHS.find(
        (depth) =>
            DEEP_RESEARCH_DEPTH_CONFIG[depth].warehouseQueries ===
            budget.maxWarehouseQueries,
    ) ?? 'standard';

/** A registration equivalent for a run loaded from the server. */
export const toDeepResearchRegistration = (
    run: AiDeepResearchRun,
    args: { threadUuid: string; userUuid: string },
): DeepResearchRunRegistration => ({
    runUuid: run.aiDeepResearchRunUuid,
    projectUuid: run.projectUuid,
    threadUuid: args.threadUuid,
    userUuid: args.userUuid,
    question: run.prompt,
    depth: getDepthFromBudget(run.budget),
    createdAt: run.createdAt,
    state: 'started',
});

/** Plain-text intro of the report markdown, for compact previews. */
export const getDeepResearchReportPreview = (markdown: string): string =>
    markdown
        .split(/^## /m)[0]
        .replace(/^(`{3,}|~{3,})[\s\S]*?(\1|$)/gm, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const adaptDeepResearchRun = ({
    run,
    events,
    registration,
    now = Date.now(),
}: {
    run: AiDeepResearchRun;
    events: AiDeepResearchEvent[];
    registration: DeepResearchRunRegistration;
    now?: number;
}): DeepResearchRunView => {
    const progressEvents = events.filter(
        (
            event,
        ): event is Extract<AiDeepResearchEvent, { eventType: 'progress' }> =>
            event.eventType === 'progress',
    );
    const latestProgress = progressEvents.at(-1)?.payload.progress;
    const queryCount = progressEvents.filter(
        (event) => event.payload.progress.activity === 'warehouse_query',
    ).length;
    const startTime = run.completedAt
        ? new Date(run.startedAt ?? run.createdAt).getTime()
        : new Date(registration.createdAt).getTime();
    const endTime = run.completedAt ? new Date(run.completedAt).getTime() : now;

    return {
        uuid: run.aiDeepResearchRunUuid,
        projectUuid: run.projectUuid,
        threadUuid: registration.threadUuid,
        question: registration.question,
        depth: registration.depth,
        status: run.status,
        phase: getPhaseLabel(
            latestProgress?.phase ?? null,
            latestProgress?.activity ?? null,
        ),
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        elapsedMs: Math.max(0, endTime - startTime),
        sourceCount: null,
        queryCount,
        findingCount: run.resultMarkdown
            ? countDeepResearchFindings(run.resultMarkdown)
            : 0,
        actionRequired: null,
        latestEvents: events
            .slice(-4)
            .reverse()
            .map((event) => ({
                uuid: event.aiDeepResearchEventUuid,
                type: event.eventType,
                label: getEventLabel(event),
                createdAt: event.createdAt,
            })),
        resultMarkdown: run.resultMarkdown,
        errorMessage: run.errorMessage,
    };
};
