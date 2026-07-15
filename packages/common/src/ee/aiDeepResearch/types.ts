import { type ApiSuccess } from '../../types/api/success';
import { type UUID } from '../../types/api/uuid';

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

export const AI_DEEP_RESEARCH_EFFORTS = [
    'low',
    'medium',
    'high',
    'xhigh',
] as const;

export type AiDeepResearchEffort = (typeof AI_DEEP_RESEARCH_EFFORTS)[number];

export type AiDeepResearchRequestBody = {
    agentUuid: UUID;
    threadUuid: UUID;
    prompt: string;
    policy?: AiDeepResearchPolicyInput;
};

export type AiDeepResearchPolicyInput = {
    instructions?: string;
    maxSteps?: number;
    maxToolCalls?: number;
    maxWarehouseQueries?: number;
    maxRuntimeMs?: number;
};

export type AiDeepResearchPolicy = {
    instructions: string | null;
    maxSteps: number;
    maxToolCalls: number;
    maxWarehouseQueries: number;
    maxRuntimeMs: number;
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

export type AiDeepResearchEvidenceSource =
    | 'lightdash'
    | 'warehouse'
    | 'external_mcp'
    | 'knowledge'
    | 'repository'
    | 'web';

export type AiDeepResearchArtifactEvidence = {
    title: string;
    summary: string;
    sourceType: AiDeepResearchEvidenceSource;
    toolName: string | null;
    toolCallId: string | null;
    mcpServerUuid: string | null;
    queryUuid: string | null;
};

export type AiDeepResearchMetricDefinition = {
    name: string;
    definition: string;
    source: string | null;
};

export type AiDeepResearchArtifact = {
    findings: string[];
    evidence: AiDeepResearchArtifactEvidence[];
    queryUuids: string[];
    metricDefinitions: AiDeepResearchMetricDefinition[];
    hypotheses: string[];
    contradictions: string[];
    confidence: AiDeepResearchConfidence;
    limitations: string[];
    finalReport: string;
};

export type AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1;
    userUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    agentName: string;
    agentInstruction: string | null;
    agentVersion: number;
    agentTags: string[];
    executionMode: 'standard' | 'deep_research';
    enableDataAccess: boolean;
    enableContentTools: boolean;
    enableSelfImprovement: boolean;
    modelProvider: string | null;
    modelName: string;
    enabledTools: string[];
    mcpServers: {
        uuid: string;
        name: string;
        url: string;
        authType: 'none' | 'bearer' | 'oauth';
        credentialScope: 'shared' | 'user' | null;
        updatedAt: string;
        enabledToolNames: string[];
    }[];
    knowledgeDocumentUuids: string[];
    knowledgeDocuments: {
        uuid: string;
        name: string;
        updatedAt: string;
    }[];
    projectContextEnabled: boolean;
    projectContextEntryCount: number;
    repositoryAccessEnabled: boolean;
    repositoryRoot: string | null;
    repositorySupportsCodeSearch: boolean;
    canRunSql: boolean;
    permissions: {
        canManageAgent: boolean;
        canRunSql: boolean;
        canUseContentTools: boolean;
        canUseDataTools: boolean;
        canUseRepository: boolean;
        canUseWriteback: boolean;
    };
    resolvedAt: string;
};

export type AiDeepResearchTimings = {
    queueMs: number;
    agentMs: number;
    toolWaitMs: number;
    warehouseMs: number;
    artifactGenerationMs: number;
    totalMs: number;
};

export const AI_DEEP_RESEARCH_CHECKPOINTS = [
    'context_resolved',
    'research_completed',
    'artifact_created',
    'thread_attached',
] as const;

export type AiDeepResearchCheckpoint =
    (typeof AI_DEEP_RESEARCH_CHECKPOINTS)[number];

export const AI_DEEP_RESEARCH_EVENT_TYPES = [
    'status_changed',
    'cancellation_requested',
    'progress',
    'phase_changed',
    'tool_call',
    'query_provenance',
    'checkpoint',
    'artifact_created',
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
    phase_changed: { phase: AiDeepResearchPhase };
    tool_call: {
        toolCallId: string | null;
        toolName: string;
        status: 'in_progress' | 'complete' | 'error';
        durationMs: number | null;
    };
    query_provenance: {
        queryUuid: string;
        toolCallId: string | null;
        toolName: string;
    };
    checkpoint: { checkpoint: AiDeepResearchCheckpoint };
    artifact_created: { evidenceCount: number; queryCount: number };
};

export type AiDeepResearchEventPayload =
    AiDeepResearchEventPayloadMap[AiDeepResearchEventType];

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
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'phase_changed';
          payload: { phase: AiDeepResearchPhase };
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'tool_call';
          payload: AiDeepResearchEventPayloadMap['tool_call'];
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'query_provenance';
          payload: AiDeepResearchEventPayloadMap['query_provenance'];
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'checkpoint';
          payload: AiDeepResearchEventPayloadMap['checkpoint'];
          createdAt: string;
      }
    | {
          aiDeepResearchEventUuid: string;
          aiDeepResearchRunUuid: string;
          eventType: 'artifact_created';
          payload: AiDeepResearchEventPayloadMap['artifact_created'];
          createdAt: string;
      };

export type AiDeepResearchRun = {
    aiDeepResearchRunUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    threadUuid: string | null;
    promptUuid: string | null;
    status: AiDeepResearchRunStatus;
    result: AiDeepResearchArtifact | null;
    policy: AiDeepResearchPolicy;
    executionContext: AiDeepResearchExecutionContextSnapshot | null;
    checkpoint: AiDeepResearchCheckpoint | null;
    timings: AiDeepResearchTimings | null;
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
