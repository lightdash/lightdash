import { type ApiSuccess } from '../../types/api/success';
import { type ItemsMap } from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';

export const AI_DEEP_RESEARCH_REPORT_RETENTION_DAYS = 30;
export const AI_DEEP_RESEARCH_QUERY_HISTORY_RETENTION_DAYS = 32;

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

export const AI_DEEP_RESEARCH_ENTRY_POINTS = ['homepage', 'ask_ai'] as const;

export type AiDeepResearchEntryPoint =
    (typeof AI_DEEP_RESEARCH_ENTRY_POINTS)[number];

export const AI_DEEP_RESEARCH_TERMINAL_REASONS = [
    'user_cancellation',
    'permission_revoked',
    'tool_limit',
    'query_limit',
    'token_limit',
    'time_limit',
    'no_relevant_data',
    'provider_error',
    'internal_error',
] as const;

export type AiDeepResearchTerminalReason =
    (typeof AI_DEEP_RESEARCH_TERMINAL_REASONS)[number];

export const AI_DEEP_RESEARCH_FAILURE_STAGES = [
    'enqueue',
    'authorization',
    'investigation',
    'finalization',
    'persistence',
    'recovery',
] as const;

export type AiDeepResearchFailureStage =
    (typeof AI_DEEP_RESEARCH_FAILURE_STAGES)[number];

export const isAiDeepResearchRunTerminal = (
    status: AiDeepResearchRunStatus,
): status is AiDeepResearchTerminalStatus =>
    AI_DEEP_RESEARCH_TERMINAL_STATUSES.includes(
        status as AiDeepResearchTerminalStatus,
    );

export type AiDeepResearchBudget = AiDeepResearchLimits & {
    maxResultRows: number;
};

export type AiDeepResearchLimits = {
    maxTokens: number;
    /** Model steps the coordinator may take before it must finish. */
    maxSteps: number;
    maxToolCalls: number;
    maxWarehouseQueries: number;
    /** Wall-clock ceiling for the research loop. */
    deadlineMs: number;
};

export const AI_DEEP_RESEARCH_DEFAULT_LIMITS: AiDeepResearchLimits = {
    maxTokens: 10_000_000,
    maxSteps: 16,
    maxToolCalls: 24,
    maxWarehouseQueries: 15,
    deadlineMs: 600_000,
};

/**
 * Fraction of a limit at which the run stops expanding — it stops delegating
 * and starts finalizing — so it lands a report instead of hitting the ceiling.
 */
export const AI_DEEP_RESEARCH_SOFT_STOP_RATIO = 0.75;

/**
 * Rows of a query result written into model context. The query still returns
 * (and the server still keeps) every row up to the run's row limit — this only
 * bounds what is replayed through the conversation on every later step.
 */
export const AI_DEEP_RESEARCH_MAX_CONTEXT_ROWS = 50;

/**
 * The hard ceiling on data workers a coordinator may delegate to in one run.
 * Delegation is the coordinator's choice; this cap is enforced server-side.
 */
export const AI_DEEP_RESEARCH_MAX_WORKERS = 2;

/** One narrow, self-contained task the coordinator hands to a data worker. */
export type AiDeepResearchWorkerTask = {
    id: string;
    question: string;
    focus: string;
};

export type AiDeepResearchWorkerEvidence = {
    finding: string;
    /** Warehouse query executions this finding is grounded in. */
    queryUuids: string[];
    /** Non-warehouse references (documents, URLs, MCP sources). */
    sources: string[];
};

/** The bounded packet a worker returns; never the raw warehouse results. */
export type AiDeepResearchWorkerFindings = {
    summary: string;
    evidence: AiDeepResearchWorkerEvidence[];
    /** What the evidence does not establish, including causal limits. */
    limitations: string[];
    confidence: AiDeepResearchConfidence;
};

/** One delegated task and what its isolated worker produced. */
export type AiDeepResearchWorkerResult = {
    task: AiDeepResearchWorkerTask;
    findings: AiDeepResearchWorkerFindings | null;
    /** Set when the worker failed; the coordinator treats it as a gap. */
    failureReason: string | null;
};

export type AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1;
    resolutionStage: 'preflight' | 'execution';
    capturedAt: string;
    agent: {
        uuid: string;
        name: string;
        version: number;
        updatedAt: string;
        hasInstruction: boolean;
        tags: string[] | null;
        spaceAccess: string[];
        enableDataAccess: boolean;
        enableSelfImprovement: boolean;
        enableContentTools: boolean;
        enableUserContext: boolean;
    };
    model: {
        provider: string | null;
        modelName: string | null;
        reasoningEnabled: boolean | null;
        keyManagement: 'lightdash-managed' | 'self-managed' | null;
    };
    tools: {
        availableToolNames: string[];
        attachedMcpServers: {
            uuid: string;
            name: string;
            enabledToolNames: string[];
        }[];
    };
    knowledgeDocuments: {
        uuid: string;
        name: string;
        updatedAt: string;
        alwaysIncludeInContext: boolean;
    }[];
    repository: {
        projectContextEnabled: boolean | null;
        aiWritebackEnabled: boolean | null;
        codingAgentEnabled: boolean | null;
        previewDeploySetupEnabled: boolean | null;
        repoDiscoveryEnabled: boolean | null;
        repoFsRoot: string | null;
        repoFsSupportsCodeSearch: boolean | null;
        availableSkillNames: string[];
    };
    effectivePermissions: {
        canManageAgent: boolean;
        canRunSql: boolean;
        canUseDataTools: boolean;
        canUseContentTools: boolean;
        canUseSelfImprovementTools: boolean;
        autoApproveSql: boolean;
    };
};

export type AiDeepResearchRequestBody = {
    prompt: string;
    /** Agent whose complete runtime configuration will execute this run. */
    agentUuid: string;
    /** Agent thread to attach the run to. Must be owned by the caller. */
    threadUuid: string;
    /** Thread message that captured this prompt. */
    promptUuid: string;
    /** Product surface that accepted the run. */
    entryPoint: AiDeepResearchEntryPoint;
    /** Resume unfinished work from a terminal run with preserved evidence. */
    resumeFromRunUuid?: string;
};

export const AI_DEEP_RESEARCH_CONFIDENCE_LEVELS = [
    'low',
    'medium',
    'high',
] as const;

export type AiDeepResearchConfidence =
    (typeof AI_DEEP_RESEARCH_CONFIDENCE_LEVELS)[number];

export type AiDeepResearchChartConfig = {
    defaultVizType:
        | 'table'
        | 'bar'
        | 'horizontal'
        | 'line'
        | 'scatter'
        | 'pie'
        | 'funnel';
    xAxisDimension: string | null;
    yAxisMetrics: string[] | null;
    groupBy: string[] | null;
    xAxisType: 'category' | 'time' | null;
    stackBars: boolean | null;
    lineType: 'line' | 'area' | null;
    funnelDataInput: 'row' | 'column' | null;
    xAxisLabel: string;
    yAxisLabel: string;
    secondaryYAxisMetric: string | null;
    secondaryYAxisLabel: string | null;
};

/**
 * Everything the UI needs to render one report chart. Derived on demand from
 * the execution the chart references; the markdown only carries compact
 * <chart> references.
 */
export type AiDeepResearchChartData = {
    source: 'warehouse';
    title: string;
    chartConfig: AiDeepResearchChartConfig;
    /** The verified execution this chart is evidence of. */
    queryUuid: string;
    metricQuery: MetricQuery;
    /** Selected + filter fields; drives labels and value formatting. */
    fields: ItemsMap;
};

export const AI_DEEP_RESEARCH_EVENT_TYPES = [
    'status_changed',
    'cancellation_requested',
    'progress',
    'report_adjusted',
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
    report_adjusted: {
        repaired: string[];
        dropped: Array<{
            key: string;
            reason:
                | 'malformed'
                | 'unknown_chart'
                | 'duplicate'
                | 'unverifiable';
        }>;
    };
};

export type AiDeepResearchEventPayload =
    | { status: AiDeepResearchRunStatus }
    | Record<string, never>
    | { progress: AiDeepResearchProgress }
    | AiDeepResearchEventPayloadMap['report_adjusted'];

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
          eventType: 'report_adjusted';
          payload: AiDeepResearchEventPayloadMap['report_adjusted'];
          createdAt: string;
      };

export type AiDeepResearchRunMetrics = {
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
    tokenUsageComplete: boolean | null;
    toolCallCount: number | null;
    toolErrorCount: number | null;
    warehouseQueryCount: number | null;
    findingsCount: number | null;
    chartCount: number | null;
};

export type AiDeepResearchRun = {
    aiDeepResearchRunUuid: string;
    projectUuid: string;
    agentUuid: string;
    aiThreadUuid: string;
    promptUuid: string;
    resumedFromRunUuid: string | null;
    entryPoint: AiDeepResearchEntryPoint;
    prompt: string;
    status: AiDeepResearchRunStatus;
    terminalReason: AiDeepResearchTerminalReason | null;
    /** The report narrative with compact <chart> references. */
    resultMarkdown: string | null;
    reportExpiresAt: string | null;
    reportExpiredAt: string | null;
    isReportExpired: boolean;
    budget: AiDeepResearchBudget;
    executionContextSnapshot: AiDeepResearchExecutionContextSnapshot | null;
    metrics: AiDeepResearchRunMetrics;
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

export type ApiAiDeepResearchRunListResponse = ApiSuccess<AiDeepResearchRun[]>;

export type ApiAiDeepResearchChartResponse =
    ApiSuccess<AiDeepResearchChartData>;

export type ApiAiDeepResearchEventsResponse =
    ApiSuccess<AiDeepResearchEventsPage>;

export type AiDeepResearchJobPayload = {
    aiDeepResearchRunUuid: string;
};
