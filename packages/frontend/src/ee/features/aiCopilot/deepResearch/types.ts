export const DEEP_RESEARCH_DEPTHS = [
    'quick',
    'standard',
    'deep',
    'exhaustive',
] as const;

export type DeepResearchDepth = (typeof DEEP_RESEARCH_DEPTHS)[number];

export type DeepResearchRunStatus =
    | 'queued'
    | 'running'
    | 'waiting_for_permission'
    | 'waiting_for_reconnection'
    | 'completed'
    | 'partially_completed'
    | 'failed'
    | 'cancelled';

export type DeepResearchSource = {
    name: string;
    isAvailable: boolean;
    warning: string | null;
};

export type DeepResearchRunView = {
    uuid: string;
    projectUuid: string;
    threadUuid: string;
    question: string;
    depth: DeepResearchDepth;
    status: DeepResearchRunStatus;
    phase: string | null;
    startedAt: string | null;
    completedAt: string | null;
    elapsedMs: number;
    sourceCount: number | null;
    queryCount: number;
    findingCount: number;
    actionRequired: null | {
        type: string;
        integrationName?: string;
        message: string;
    };
    latestEvents: Array<{
        uuid: string;
        type: string;
        label: string;
        createdAt: string;
    }>;
    /** The report as a markdown document with embedded chart blocks. */
    resultMarkdown: string | null;
    errorMessage: string | null;
};

export type DeepResearchRunRegistration = {
    runUuid: string;
    projectUuid: string;
    threadUuid: string;
    userUuid: string;
    question: string;
    depth: DeepResearchDepth;
    createdAt: string;
    state: 'starting' | 'started' | 'start_failed';
    errorMessage?: string;
};

export type StartDeepResearchArgs = {
    question: string;
    depth: DeepResearchDepth;
};
