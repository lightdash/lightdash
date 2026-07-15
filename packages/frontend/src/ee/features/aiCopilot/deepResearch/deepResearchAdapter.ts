import {
    assertUnreachable,
    type AiDeepResearchActivity,
    type AiDeepResearchEvidence,
    type AiDeepResearchEffort,
    type AiDeepResearchEvent,
    type AiDeepResearchPhase,
    type AiDeepResearchRun,
} from '@lightdash/common';
import {
    type DeepResearchArtifact,
    type DeepResearchDepth,
    type DeepResearchEvidence,
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
        label: 'Quick',
        effort: 'low',
        duration: 'Up to 15 minutes',
        warehouseQueries: 10,
        description: 'A focused check of the strongest available evidence.',
    },
    standard: {
        label: 'Standard',
        effort: 'medium',
        duration: 'Up to 30 minutes',
        warehouseQueries: 25,
        description:
            'A balanced investigation with validation and alternatives.',
    },
    deep: {
        label: 'Deep',
        effort: 'high',
        duration: 'Up to 45 minutes',
        warehouseQueries: 50,
        description: 'A broad investigation with more competing explanations.',
    },
    exhaustive: {
        label: 'Exhaustive',
        effort: 'xhigh',
        duration: 'Up to 55 minutes',
        warehouseQueries: 100,
        description: 'The widest evidence review for high-stakes questions.',
    },
};

const QUERY_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f-]{27,36}/i;

const getSafeEvidenceUrl = (value: string | null): string | null => {
    if (!value) return null;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
};

const getEvidenceSourceType = (
    sourceType: 'lightdash' | 'warehouse' | 'web',
    sourceLabel: string,
): DeepResearchEvidence['sourceType'] => {
    if (/github|repository|pull request/i.test(sourceLabel)) {
        return 'repository';
    }
    if (/document|knowledge|notion/i.test(sourceLabel)) {
        return 'document';
    }
    return sourceType;
};

const getEvidence = (
    evidence: AiDeepResearchEvidence,
    findingIndex: number,
    evidenceIndex: number,
): DeepResearchEvidence => {
    const sourceUrl = getSafeEvidenceUrl(evidence.sourceUrl);
    const sourceType = getEvidenceSourceType(
        evidence.sourceType,
        evidence.sourceLabel,
    );
    return {
        uuid: `evidence-${findingIndex + 1}-${evidenceIndex + 1}`,
        title: evidence.title,
        description: evidence.description,
        sourceType,
        sourceLabel: evidence.sourceLabel,
        sourceUrl,
        queryUuid:
            sourceUrl &&
            (evidence.sourceType === 'lightdash' ||
                evidence.sourceType === 'warehouse')
                ? (sourceUrl.match(QUERY_UUID_PATTERN)?.[0] ?? null)
                : null,
        metrics: [],
        filters: [],
        dateRange: null,
    };
};

const getArtifact = (run: AiDeepResearchRun): DeepResearchArtifact | null => {
    if (!run.result) {
        return null;
    }

    const findingConfidences = run.result.findings.map(
        (finding) => finding.confidence,
    );
    const confidence = findingConfidences.includes('low')
        ? 'low'
        : findingConfidences.includes('medium')
          ? 'medium'
          : 'high';

    return {
        executiveAnswer: run.result.summary,
        findings: run.result.findings.map((finding, findingIndex) => ({
            uuid: `finding-${findingIndex + 1}`,
            title: finding.title,
            summary: finding.summary,
            confidence: finding.confidence,
            evidence: finding.evidence.map((evidence, evidenceIndex) =>
                getEvidence(evidence, findingIndex, evidenceIndex),
            ),
        })),
        contradictoryEvidence: run.result.caveats,
        definitionsAndMethodology: run.result.scope,
        confidence,
        limitations: run.result.caveats,
        nextQuestions: run.result.unresolvedQuestions.length
            ? run.result.unresolvedQuestions
            : run.result.nextSteps,
    };
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
    const endTime = run.completedAt ? new Date(run.completedAt).getTime() : now;
    const startTime = new Date(run.startedAt ?? run.createdAt).getTime();

    return {
        uuid: run.aiDeepResearchRunUuid,
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
        findingCount: run.result?.findings.length ?? 0,
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
        artifact: getArtifact(run),
        errorMessage: run.errorMessage,
    };
};
