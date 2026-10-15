import {
    assertUnreachable,
    countDeepResearchFindings,
    type AiDeepResearchActivity,
    type AiDeepResearchEvent,
    type AiDeepResearchPhase,
    type AiDeepResearchRun,
    type AiDeepResearchRunStatus,
} from '@lightdash/common';
import i18n from '../../../../i18n/i18n';
import {
    type DeepResearchRunRegistration,
    type DeepResearchRunStatus,
    type DeepResearchRunView,
} from './types';

const getActivityLabel = (activity: AiDeepResearchActivity | null): string => {
    switch (activity) {
        case 'lightdash_metadata':
            return i18n.t('runProgress.activity.lightdashMetadata', {
                ns: 'aiAgent',
            });
        case 'warehouse_query':
            return i18n.t('runProgress.activity.warehouseQuery', {
                ns: 'aiAgent',
            });
        case 'web_search':
            return i18n.t('runProgress.activity.webSearch', { ns: 'aiAgent' });
        case 'web_fetch':
            return i18n.t('runProgress.activity.webFetch', { ns: 'aiAgent' });
        case 'reporting':
            return i18n.t('runProgress.activity.reporting', { ns: 'aiAgent' });
        case null:
            return i18n.t('runProgress.activity.updated', { ns: 'aiAgent' });
        default:
            return assertUnreachable(activity, 'Unknown research activity');
    }
};

const STATUS_CHANGED_KEYS: Record<AiDeepResearchRunStatus, string> = {
    queued: 'runProgress.statusChanged.queued',
    running: 'runProgress.statusChanged.running',
    completed: 'runProgress.statusChanged.completed',
    partially_completed: 'runProgress.statusChanged.partiallyCompleted',
    failed: 'runProgress.statusChanged.failed',
    cancelled: 'runProgress.statusChanged.cancelled',
};

const getEventLabel = (event: AiDeepResearchEvent): string => {
    switch (event.eventType) {
        case 'status_changed':
            return i18n.t(STATUS_CHANGED_KEYS[event.payload.status], {
                ns: 'aiAgent',
            });
        case 'cancellation_requested':
            return i18n.t('runProgress.event.cancellationRequested', {
                ns: 'aiAgent',
            });
        case 'progress':
            return getActivityLabel(event.payload.progress.activity);
        case 'report_adjusted':
            return i18n.t('runProgress.event.reportAdjusted', {
                ns: 'aiAgent',
            });
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
            return i18n.t('runProgress.phase.planning', { ns: 'aiAgent' });
        case 'investigating':
            return activity === 'warehouse_query'
                ? i18n.t('runProgress.phase.testingExplanations', {
                      ns: 'aiAgent',
                  })
                : i18n.t('runProgress.phase.gatheringContext', {
                      ns: 'aiAgent',
                  });
        case 'validating':
            return activity === 'web_fetch'
                ? i18n.t('runProgress.phase.reviewingEvidence', {
                      ns: 'aiAgent',
                  })
                : i18n.t('runProgress.phase.validatingFindings', {
                      ns: 'aiAgent',
                  });
        case 'synthesizing':
            return i18n.t('runProgress.phase.writingReport', { ns: 'aiAgent' });
        case null:
            return null;
        default:
            return assertUnreachable(phase, 'Unknown research phase');
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
    resumeFromRunUuid:
        run.status === 'partially_completed' || run.status === 'failed'
            ? run.aiDeepResearchRunUuid
            : undefined,
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
        promptUuid: run.promptUuid,
        question: registration.question,
        status: run.status,
        terminalReason: run.terminalReason,
        phase: getPhaseLabel(
            latestProgress?.phase ?? null,
            latestProgress?.activity ?? null,
        ),
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        updatedAt: run.updatedAt,
        elapsedMs: Math.max(0, endTime - startTime),
        sourceCount: null,
        queryCount,
        findingCount:
            run.metrics.findingsCount ??
            (run.resultMarkdown
                ? countDeepResearchFindings(run.resultMarkdown)
                : 0),
        actionRequired: null,
        latestEvents: getLatestEvents(events),
        resultMarkdown: run.resultMarkdown,
        reportExpiresAt: run.reportExpiresAt,
        reportExpiredAt: run.reportExpiredAt,
        isReportExpired: run.isReportExpired,
        document: run.document,
        errorMessage: run.errorMessage,
    };
};
