import {
    assertUnreachable,
    countDeepResearchFindings,
    type AiDeepResearchActivity,
    type AiDeepResearchEvent,
    type AiDeepResearchRun,
} from '@lightdash/common';
import {
    type DeepResearchRunRegistration,
    type DeepResearchRunStatus,
    type DeepResearchRunView,
} from './types';

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
    activity: AiDeepResearchActivity | null,
): string | null => {
    switch (activity) {
        case 'warehouse_query':
            return 'Testing explanations';
        case 'reporting':
            return 'Writing the report';
        case 'lightdash_metadata':
        case 'web_search':
        case 'web_fetch':
            return 'Gathering context';
        case null:
            return null;
        default:
            return assertUnreachable(activity, 'Unknown research activity');
    }
};

const getLatestEvents = (events: AiDeepResearchEvent[]) => {
    const labels = new Set<string>();
    return events.reduceRight<DeepResearchRunView['latestEvents']>(
        (latestEvents, event) => {
            const label = getEventLabel(event);
            if (latestEvents.length === 4 || labels.has(label)) {
                return latestEvents;
            }

            labels.add(label);
            latestEvents.push({
                uuid: event.aiDeepResearchEventUuid,
                type: event.eventType,
                label,
                createdAt: event.createdAt,
            });
            return latestEvents;
        },
        [],
    );
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

/** A registration equivalent for a run loaded from the server. */
export const toDeepResearchRegistration = (
    run: AiDeepResearchRun,
    args: { threadUuid: string; userUuid: string },
): DeepResearchRunRegistration => ({
    runUuid: run.aiDeepResearchRunUuid,
    projectUuid: run.projectUuid,
    agentUuid: run.agentUuid,
    threadUuid: args.threadUuid,
    promptUuid: run.promptUuid,
    userUuid: args.userUuid,
    question: run.prompt,
    createdAt: run.createdAt,
    state: 'started',
});

/** Intro of the report markdown, before the detailed report sections. */
export const getDeepResearchReportPreview = (markdown: string): string =>
    markdown.split(/^## /m)[0].trim();

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
        agentUuid: run.agentUuid,
        threadUuid: registration.threadUuid,
        question: registration.question,
        status: run.status,
        phase: getPhaseLabel(latestProgress?.activity ?? null),
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        updatedAt: run.updatedAt,
        elapsedMs: Math.max(0, endTime - startTime),
        sourceCount: null,
        queryCount,
        findingCount: run.resultMarkdown
            ? countDeepResearchFindings(run.resultMarkdown)
            : 0,
        actionRequired: null,
        latestEvents: getLatestEvents(events),
        resultMarkdown: run.resultMarkdown,
        resultChartData: run.resultChartData,
        reportExpiresAt: run.reportExpiresAt,
        reportExpiredAt: run.reportExpiredAt,
        isReportExpired: run.isReportExpired,
        errorMessage: run.errorMessage,
    };
};
