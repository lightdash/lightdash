import { type AiDeepResearchTerminalReason } from '@lightdash/common';

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
    agentUuid: string;
    threadUuid: string;
    question: string;
    status: DeepResearchRunStatus;
    terminalReason: AiDeepResearchTerminalReason | null;
    phase: string | null;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
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
    /** The report narrative with compact <chart> references. */
    resultMarkdown: string | null;
    /** Render data for each referenced chart, keyed by chart key. */
    reportExpiresAt: string | null;
    reportExpiredAt: string | null;
    isReportExpired: boolean;
    errorMessage: string | null;
};

export type DeepResearchReportView = Pick<
    DeepResearchRunView,
    | 'uuid'
    | 'projectUuid'
    | 'agentUuid'
    | 'threadUuid'
    | 'question'
    | 'completedAt'
    | 'sourceCount'
    | 'resultMarkdown'
    | 'isReportExpired'
>;

export type DeepResearchRunRegistration = {
    runUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    resumeFromRunUuid?: string;
    userUuid: string;
    question: string;
    createdAt: string;
    state: 'starting' | 'started' | 'start_failed';
    errorMessage?: string;
};

export type StartDeepResearchArgs = {
    question: string;
    resumeFromRunUuid?: string;
};
