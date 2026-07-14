import { type ApiSuccess } from '../../types/api/success';

export const AI_DEEP_RESEARCH_RUN_STATUSES = [
    'queued',
    'running',
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
] as const;

export type AiDeepResearchRunStatus =
    (typeof AI_DEEP_RESEARCH_RUN_STATUSES)[number];

export const AI_DEEP_RESEARCH_TERMINAL_STATUSES = [
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
] as const satisfies readonly AiDeepResearchRunStatus[];

export type AiDeepResearchTerminalStatus =
    (typeof AI_DEEP_RESEARCH_TERMINAL_STATUSES)[number];

export const isAiDeepResearchRunTerminal = (
    status: AiDeepResearchRunStatus,
): status is AiDeepResearchTerminalStatus =>
    AI_DEEP_RESEARCH_TERMINAL_STATUSES.includes(
        status as AiDeepResearchTerminalStatus,
    );

export type AiDeepResearchBudget = {
    maxRuntimeMs: number;
    maxTokens: number;
    maxToolCalls: number;
    maxWarehouseQueries: number;
    maxResultRows: number;
};

export type AiDeepResearchConfidence = 'low' | 'medium' | 'high';

export type AiDeepResearchEvidence = {
    title: string;
    description: string;
    sourceType: 'lightdash' | 'warehouse' | 'web';
    sourceLabel: string;
    sourceUrl: string | null;
};

export type AiDeepResearchFinding = {
    title: string;
    summary: string;
    confidence: AiDeepResearchConfidence;
    evidence: AiDeepResearchEvidence[];
};

export type AiDeepResearchReport = {
    summary: string;
    findings: AiDeepResearchFinding[];
    caveats: string[];
    scope: string;
    unresolvedQuestions: string[];
    nextSteps: string[];
};

export const AI_DEEP_RESEARCH_EVENT_TYPES = [
    'status_changed',
    'cancellation_requested',
    'progress',
] as const;

export type AiDeepResearchEventType =
    (typeof AI_DEEP_RESEARCH_EVENT_TYPES)[number];

export const AI_DEEP_RESEARCH_PHASES = [
    'planning',
    'investigating',
    'validating',
    'synthesizing',
] as const;

export type AiDeepResearchPhase = (typeof AI_DEEP_RESEARCH_PHASES)[number];

export const AI_DEEP_RESEARCH_ACTIVITIES = [
    'lightdash_metadata',
    'warehouse_query',
    'web_search',
    'web_fetch',
    'reporting',
] as const;

export type AiDeepResearchActivity =
    (typeof AI_DEEP_RESEARCH_ACTIVITIES)[number];

export type AiDeepResearchProgress = {
    phase: AiDeepResearchPhase;
    activity: AiDeepResearchActivity | null;
    current: number | null;
    total: number | null;
};

export type AiDeepResearchEventPayloadMap = {
    status_changed: { status: AiDeepResearchRunStatus };
    cancellation_requested: Record<string, never>;
    progress: { progress: AiDeepResearchProgress };
};

export type AiDeepResearchEventPayload =
    | { status: AiDeepResearchRunStatus }
    | Record<string, never>
    | { progress: AiDeepResearchProgress };

// TSOA cannot resolve the equivalent mapped/indexed discriminated union.
export type AiDeepResearchEvent =
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'status_changed';
          payload: { status: AiDeepResearchRunStatus };
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'cancellation_requested';
          payload: Record<string, never>;
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'progress';
          payload: { progress: AiDeepResearchProgress };
          createdAt: string;
      };

export type AiDeepResearchRun = {
    aiDeepResearchRunUuid: string;
    projectUuid: string;
    status: AiDeepResearchRunStatus;
    result: AiDeepResearchReport | null;
    budget: AiDeepResearchBudget;
    errorMessage: string | null;
    cancellationRequestedAt: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
};

export type AiDeepResearchEventsPage = {
    events: AiDeepResearchEvent[];
    nextCursor: string | null;
};

export type ApiAiDeepResearchRunResponse = ApiSuccess<AiDeepResearchRun>;

export type ApiAiDeepResearchEventsResponse =
    ApiSuccess<AiDeepResearchEventsPage>;

export type AiDeepResearchJobPayload = {
    aiDeepResearchRunUuid: string;
};
