import { type ApiSuccess } from '../../types/api/success';
import { type ItemsMap } from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';

export const AI_DEEP_RESEARCH_REPORT_RETENTION_DAYS = 30;
export const AI_DEEP_RESEARCH_QUERY_RESULTS_RETENTION_DAYS = 31;
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
    'provider_error',
    'internal_error',
] as const;

export type AiDeepResearchTerminalReason =
    (typeof AI_DEEP_RESEARCH_TERMINAL_REASONS)[number];

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
    maxToolCalls: number;
    maxWarehouseQueries: number;
    maxHypotheses: number;
};

export const AI_DEEP_RESEARCH_DEFAULT_LIMITS: AiDeepResearchLimits = {
    maxTokens: 10_000_000,
    maxToolCalls: 1_000,
    maxWarehouseQueries: 100,
    maxHypotheses: 5,
};

export type AiDeepResearchHypothesis = {
    id: string;
    claim: string;
    /** Why the claim is plausible given what is already known. */
    rationale: string;
    /** Evidence that would support the claim if found. */
    supportingEvidence: string;
    /** Evidence that would falsify the claim if found. */
    falsifyingEvidence: string;
};

export const AI_DEEP_RESEARCH_HYPOTHESIS_VERDICTS = [
    'supported',
    'refuted',
    'inconclusive',
] as const;

export type AiDeepResearchHypothesisVerdict =
    (typeof AI_DEEP_RESEARCH_HYPOTHESIS_VERDICTS)[number];

export type AiDeepResearchInvestigationEvidence = {
    finding: string;
    /** Warehouse query executions this finding is grounded in. */
    queryUuids: string[];
    /** Non-warehouse references (documents, URLs, MCP sources). */
    sources: string[];
};

export type AiDeepResearchInvestigationReport = {
    verdict: AiDeepResearchHypothesisVerdict;
    summary: string;
    evidence: AiDeepResearchInvestigationEvidence[];
    alternativeExplanations: string[];
    /** Why the evidence does or does not establish causation. */
    causalLimitations: string[];
    confidence: AiDeepResearchConfidence;
};

/** One hypothesis and what its isolated investigation produced. */
export type AiDeepResearchInvestigation = {
    hypothesis: AiDeepResearchHypothesis;
    report: AiDeepResearchInvestigationReport | null;
    /** Set when the investigator failed; the judge treats it as a gap. */
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

export type AiDeepResearchChartSnapshotValue = string | number | boolean | null;

/** The rendered dataset of a report chart, frozen at publish time. */
export type AiDeepResearchChartSnapshot = {
    takenAt: string;
    rowCount: number;
    truncated: boolean;
    /** Field ids ordering the values in each row. */
    columnOrder: string[];
    /** Raw row values ordered by `columnOrder`; formatted client-side. */
    rows: AiDeepResearchChartSnapshotValue[][];
};

/**
 * Everything the UI needs to render one report chart, keyed by chart key in
 * `AiDeepResearchRun.resultChartData`. Written entirely by the backend at
 * publish time; the markdown only carries compact <chart> references.
 */
export type AiDeepResearchChartData = {
    source: 'warehouse' | 'inline';
    title: string;
    chartConfig: AiDeepResearchChartConfig;
    /** Warehouse charts: the verified execution this chart is evidence of. */
    queryUuid: string | null;
    /** Inline charts: verified executions the data was derived from. */
    derivedFrom: string[] | null;
    /** Real for warehouse charts, synthesized for inline ones. */
    metricQuery: MetricQuery;
    /** Selected + filter fields; drives labels and value formatting. */
    fields: ItemsMap;
    /** Null only for reports persisted before snapshots existed. */
    snapshot: AiDeepResearchChartSnapshot | null;
};

export type AiDeepResearchChartDataMap = Record<
    string,
    AiDeepResearchChartData
>;

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
    entryPoint: AiDeepResearchEntryPoint;
    prompt: string;
    status: AiDeepResearchRunStatus;
    /** The report narrative with compact <chart> references. */
    resultMarkdown: string | null;
    /** Render data for each referenced chart, keyed by chart key. */
    resultChartData: AiDeepResearchChartDataMap | null;
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
