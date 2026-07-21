import { type ApiSuccess } from '../../types/api/success';

export const AGENT_ONBOARDING_RUN_STATUSES = [
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
] as const;

export type AgentOnboardingRunStatus =
    (typeof AGENT_ONBOARDING_RUN_STATUSES)[number];

export const AGENT_ONBOARDING_ACTIVE_STATUSES = [
    'queued',
    'running',
] as const satisfies readonly AgentOnboardingRunStatus[];

export const AGENT_ONBOARDING_TERMINAL_STATUSES = [
    'completed',
    'failed',
    'cancelled',
] as const satisfies readonly AgentOnboardingRunStatus[];

export type AgentOnboardingTerminalStatus =
    (typeof AGENT_ONBOARDING_TERMINAL_STATUSES)[number];

export const isAgentOnboardingRunTerminal = (
    status: AgentOnboardingRunStatus,
): status is AgentOnboardingTerminalStatus =>
    AGENT_ONBOARDING_TERMINAL_STATUSES.includes(
        status as AgentOnboardingTerminalStatus,
    );

export const AGENT_ONBOARDING_STAGES = [
    'preparing_project',
    'exploring_warehouse',
    'deploying_semantic_layer',
    'building_dashboard',
    'verifying',
    'handoff',
] as const;

export type AgentOnboardingStage = (typeof AGENT_ONBOARDING_STAGES)[number];

export type AgentOnboardingRunEvent = {
    eventType: 'stage' | 'step' | 'log';
    message: string;
    stage: AgentOnboardingStage | null;
    createdAt: string;
};

export type AgentOnboardingHandoff = {
    summary: string | null;
    dashboardUrl: string | null;
};

export type AgentOnboardingUsage = {
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
};

export type AgentOnboardingFile = {
    path: string;
    sizeBytes: number;
    updatedAt: string;
};

export type AgentOnboardingFileContent = AgentOnboardingFile & {
    content: string;
    encoding: 'utf8' | 'base64';
};

export type AgentOnboardingRun = {
    agentOnboardingRunUuid: string;
    projectUuid: string;
    status: AgentOnboardingRunStatus;
    stage: AgentOnboardingStage | null;
    events: AgentOnboardingRunEvent[];
    handoff: AgentOnboardingHandoff | null;
    usage: AgentOnboardingUsage | null;
    files: AgentOnboardingFile[];
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
};

export type ApiAgentOnboardingRunResponse = ApiSuccess<AgentOnboardingRun>;

export type ApiAgentOnboardingFileResponse =
    ApiSuccess<AgentOnboardingFileContent>;

export type AgentOnboardingJobPayload = {
    agentOnboardingRunUuid: string;
};
