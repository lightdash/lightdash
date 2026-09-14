import type { ApiSuccess, KnexPaginatedData } from '../..';
import type { AiDeepResearchLimits } from '../aiDeepResearch/types';
import type {
    DataAppClaudeModel,
    DataAppCodingAgent,
    DataAppModelVisibility,
} from '../apps/types';
import type {
    AiAgentEvaluationRunSummary,
    AiAgentMemoryScope,
    AiAgentMemoryStatus,
    AiAgentSummary,
    AiAgentThreadSummary,
    AiAgentUser,
    AiModelOption,
} from './index';
import type {
    AiAgentModelConfig,
    AiPromptTokenUsage,
    AiThreadCreatedFrom,
} from './requestTypes';

export type AiAgentAdminFilters = {
    projectUuids?: string[];
    agentUuids?: string[];
    userUuids?: string[];
    createdFrom?: AiThreadCreatedFrom;
    humanScore?: number; // (-1, 0, 1)
    dateFrom?: string; // ISO date string
    dateTo?: string; // ISO date string
    search?: string; // Search by thread title
};

export type AiAgentAdminSortField = 'createdAt' | 'title';

export type AiAgentAdminSort = {
    field: AiAgentAdminSortField;
    direction: 'asc' | 'desc';
};

export type AiAgentAdminFeedbackSummary = {
    upvotes: number;
    downvotes: number;
    neutral: number;
    total: number;
};

type ThreadSummary = Pick<
    AiAgentThreadSummary<
        AiAgentUser & {
            slackUserId: string | null;
            email: string | null;
        }
    >,
    'user' | 'createdAt' | 'createdFrom' | 'title' | 'uuid'
>;

export type AiAgentAdminThreadSummary = ThreadSummary & {
    agent: Pick<AiAgentSummary, 'uuid' | 'name' | 'imageUrl'>;
    project: {
        uuid: string;
        name: string;
    };
    feedbackSummary: AiAgentAdminFeedbackSummary;
    promptCount: number;
    slackChannelId: string | null;
    slackThreadTs: string | null;
};

export type AiAgentAdminConversationsSummary = {
    threads: AiAgentAdminThreadSummary[];
};

export type ApiAiAgentAdminConversationsResponse = ApiSuccess<
    KnexPaginatedData<AiAgentAdminConversationsSummary>
>;

export type AiAgentThreadDumpToolCall = {
    toolCallId: string;
    parentToolCallId: string | null;
    name: string;
    source: 'lightdash' | 'mcp';
    args: unknown;
    result: string | null;
    resultOmitted: string | null;
    isError: boolean;
};

export type AiAgentThreadDumpArtifact = {
    artifactUuid: string;
    versionUuid: string;
    versionNumber: number;
    artifactType: 'chart' | 'dashboard';
    title: string | null;
    description: string | null;
    chartConfig: Record<string, unknown> | null;
    dashboardConfig: Record<string, unknown> | null;
};

export type AiAgentThreadDumpTurn = {
    promptUuid: string;
    createdAt: string;
    respondedAt: string | null;
    hidden: boolean;
    user: string;
    assistant: string | null;
    error: string | null;
    interrupted: boolean;
    feedback: { score: number; comment: string | null } | null;
    steers: string[];
    modelConfig: { modelName: string; modelProvider: string } | null;
    tokenUsage: AiPromptTokenUsage | null;
    toolCalls: AiAgentThreadDumpToolCall[];
    artifacts: AiAgentThreadDumpArtifact[];
};

export type AiAgentThreadDumpAgent = Pick<
    AiAgentSummary,
    | 'uuid'
    | 'name'
    | 'instruction'
    | 'tags'
    | 'integrations'
    | 'modelConfig'
    | 'enableDataAccess'
    | 'enableSelfImprovement'
    | 'enableContentTools'
    | 'enableUserContext'
    | 'enableSqlMode'
    | 'adminOnly'
    | 'version'
>;

export type AiAgentThreadDump = {
    schemaVersion: 1;
    generatedAt: string;
    lightdashVersion: string;
    defaultProvider: string;
    organizationUuid: string;
    projectUuid: string;
    threadUuid: string;
    agentUuid: string | null;
    userUuid: string | null;
    createdFrom: AiThreadCreatedFrom;
    title: string | null;
    agent: AiAgentThreadDumpAgent | null;
    turns: AiAgentThreadDumpTurn[];
};

export type ApiAiAgentThreadDumpResponse = ApiSuccess<AiAgentThreadDump>;

export type AiAgentAdminEvalFilters = {
    projectUuids?: string[];
    agentUuids?: string[];
    search?: string;
};

export type AiAgentAdminEvalSummary = {
    evalUuid: string;
    title: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    agent: Pick<AiAgentSummary, 'uuid' | 'name' | 'imageUrl'>;
    project: {
        uuid: string;
        name: string;
    };
    promptCount: number;
    latestRun: Pick<
        AiAgentEvaluationRunSummary,
        'runUuid' | 'status' | 'createdAt' | 'completedAt'
    > | null;
};

export type AiAgentAdminEvalsSummary = {
    evals: AiAgentAdminEvalSummary[];
};

export type ApiAiAgentAdminEvalsResponse = ApiSuccess<
    KnexPaginatedData<AiAgentAdminEvalsSummary>
>;

export type AiAgentAdminEvalPrompt = {
    evalPromptUuid: string;
    // Text of the prompt; for thread-referenced prompts this is the original
    // user prompt, null only if the referenced prompt was deleted
    prompt: string | null;
    expectedResponse: string | null;
    threadUuid: string | null;
    createdAt: Date;
};

export type ApiAiAgentAdminEvalPromptsResponse = ApiSuccess<{
    prompts: AiAgentAdminEvalPrompt[];
}>;

export type AiAgentAdminMemoryFilters = {
    projectUuids?: string[];
    userUuids?: string[];
    statuses?: AiAgentMemoryStatus[];
    scopes?: AiAgentMemoryScope[];
    search?: string; // Search by memory title, slug or body
};

export type AiAgentAdminMemorySortField = 'generatedAt' | 'citedCount';

export type AiAgentAdminMemorySort = {
    field: AiAgentAdminMemorySortField;
    direction: 'asc' | 'desc';
};

// Admin list row. Independent from the owner-facing AiAgentUserMemoryItem:
// separate API surfaces, free to diverge
export type AiAgentAdminMemoryItem = {
    uuid: string;
    slug: string;
    title: string;
    // Memory body, truncated server-side for the list view
    summary: string;
    status: AiAgentMemoryStatus;
    scope: AiAgentMemoryScope;
    project: {
        uuid: string;
        name: string;
    };
    agent: {
        uuid: string;
        name: string;
        imageUrl: string | null;
    } | null;
    user: {
        uuid: string;
        name: string;
        email: string | null;
    } | null;
    sourceThreadUuid: string | null;
    citedCount: number;
    lastCitedAt: string | null;
    pulledCount: number;
    lastPulledAt: string | null;
    generatedAt: string;
};

export type AiAgentAdminMemoriesSummary = {
    memories: AiAgentAdminMemoryItem[];
};

export type ApiAiAgentAdminMemoriesResponse = ApiSuccess<
    KnexPaginatedData<AiAgentAdminMemoriesSummary>
>;

export type AiAgentAdminPromptActivityPoint = {
    date: string;
    promptCount: number;
};

export type ApiAiAgentAdminPromptActivityResponse = ApiSuccess<
    AiAgentAdminPromptActivityPoint[]
>;

export type McpActivityStatus = 'success' | 'error';

export type McpActivityFilters = {
    projectUuids?: string[];
    userUuids?: string[];
    agentUuids?: string[];
    toolNames?: string[];
    clientNames?: string[];
    status?: McpActivityStatus;
    dateFrom?: string; // ISO date string, inclusive
    // ISO date string, inclusive but compared as a timestamp: a date-only
    // value means midnight, excluding the rest of that day — send a full
    // timestamp to include it
    dateTo?: string;
};

export type McpActivitySortField = 'createdAt' | 'durationMs';

export type McpActivitySort = {
    field: McpActivitySortField;
    direction: 'asc' | 'desc';
};

/**
 * Server-computed display group for session-grouped activity: a session
 * split into segments on 1h inactivity gaps (sessionless calls chunk the
 * same way under a shared no-session block). Counts cover the whole
 * segment, not just the loaded page. Null when the query isn't
 * session-grouped (e.g. sorted by duration).
 */
export type McpActivitySessionGroup = {
    key: string;
    callCount: number;
    errorCount: number;
};

export type McpActivityItem = {
    uuid: string;
    createdAt: string;
    user: {
        uuid: string;
        name: string;
        email: string | null;
    };
    project: {
        uuid: string;
        name: string;
    } | null;
    agent: {
        uuid: string;
        name: string;
    } | null;
    toolName: string;
    toolArgs: Record<string, unknown>;
    status: McpActivityStatus;
    errorMessage: string | null;
    durationMs: number;
    clientName: string | null;
    clientVersion: string | null;
    userAgent: string | null;
    authType: string;
    protocolVersion: string | null;
    sessionId: string | null;
    sessionGroup: McpActivitySessionGroup | null;
};

export type McpActivitySummary = {
    toolCalls: McpActivityItem[];
};

export type ApiMcpActivityResponse = ApiSuccess<
    KnexPaginatedData<McpActivitySummary>
>;

export type McpActivityToolCount = {
    toolName: string;
    count: number;
};

export type McpActivityAgentCount = {
    // null represents tool calls made without an agent
    agent: {
        uuid: string;
        name: string;
    } | null;
    count: number;
};

export type McpActivityStats = {
    totalCalls: number;
    errorCalls: number;
    topTools: McpActivityToolCount[];
    agents: McpActivityAgentCount[];
    recentErrors: McpActivityItem[];
};

// Status is not accepted as a filter: the response already breaks results
// down by status, and recentErrors is always error-only
export type McpActivityStatsFilters = Omit<McpActivityFilters, 'status'>;

export type ApiMcpActivityStatsResponse = ApiSuccess<McpActivityStats>;

export type ComputedAiOrganizationSettings = {
    isCopilotEnabled: boolean;
    isTrial: boolean;
    defaultAiAgentModelOptions: AiModelOption[];
    // Full option list an admin can pick from (ignores visibility restrictions); null for non-admins.
    // Optional to keep the response schema backwards-compatible for old clients.
    configurableModelOptions?: AiModelOption[] | null;
    // True when a BYO key is set that can't serve the review model, so reviews are paused.
    aiAgentReviewsPausedByByok?: boolean;
};

// AI Organization Settings Types
export const BYO_AI_PROVIDERS = ['anthropic', 'google', 'openai'] as const;
export type ByoAiProvider = (typeof BYO_AI_PROVIDERS)[number];

export const isByoAiProvider = (provider: string): provider is ByoAiProvider =>
    (BYO_AI_PROVIDERS as readonly string[]).includes(provider);

export type AiProviderApiKeysSet = Record<ByoAiProvider, boolean>;

export type AiProviderApiKeyHints = Record<ByoAiProvider, string | null>;

export type UpdateAiProviderApiKeys = Partial<
    Record<ByoAiProvider, string | null>
>;

export type AiOrgProviderModelVisibility = {
    enabled: boolean;
    // Preset names; omitted or empty = all models of the provider allowed
    allowedModels?: string[];
};

export type AiOrgModelVisibility = Partial<
    Record<ByoAiProvider, AiOrgProviderModelVisibility>
>;

export type AiOrganizationSettings = {
    organizationUuid: string;
    aiAgentsVisible: boolean;
    aiAgentReviewsEnabled: boolean;
    aiAgentMemoryEnabled: boolean;
    deepResearchLimits: AiDeepResearchLimits;
    deepResearchRawSqlEnabled: boolean;
    mcpContentWritesEnabled: boolean;
    mcpAgentsEnabled: boolean;
    requireExplicitSlackChannelLinking?: boolean;
    defaultAiAgentModelConfig: AiAgentModelConfig | null;
    // Optional to keep the response schema backwards-compatible for old clients.
    modelVisibility?: AiOrgModelVisibility | null;
    // Which Data App Claude models (opus/sonnet/haiku) users can pick. Optional
    // for backwards compatibility with old clients; unset = all visible.
    dataAppModelVisibility?: DataAppModelVisibility | null;
    providerApiKeysSet: AiProviderApiKeysSet;
    providerApiKeyHints: AiProviderApiKeyHints;
    threadRetentionHours?: number | null;
};

export type CreateAiOrganizationSettings = Omit<
    AiOrganizationSettings,
    'providerApiKeysSet' | 'providerApiKeyHints' | 'aiAgentMemoryEnabled'
> & {
    providerApiKeys?: UpdateAiProviderApiKeys;
};

export type UpdateAiOrganizationSettings = {
    aiAgentsVisible?: boolean;
    aiAgentReviewsEnabled?: boolean;
    aiAgentMemoryEnabled?: boolean;
    deepResearchLimits?: AiDeepResearchLimits;
    deepResearchRawSqlEnabled?: boolean;
    mcpContentWritesEnabled?: boolean;
    mcpAgentsEnabled?: boolean;
    requireExplicitSlackChannelLinking?: boolean;
    defaultAiAgentModelConfig?: AiAgentModelConfig | null;
    modelVisibility?: AiOrgModelVisibility | null;
    dataAppModelVisibility?: DataAppModelVisibility | null;
    providerApiKeys?: UpdateAiProviderApiKeys;
    threadRetentionHours?: number | null;
};

export type ApiAiOrganizationSettingsResponse = ApiSuccess<
    AiOrganizationSettings & ComputedAiOrganizationSettings
>;

export type AiOrganizationRuntimeSettings = {
    isCopilotEnabled: boolean;
    isTrial: boolean;
    aiAgentsVisible: boolean;
    aiAgentMemoryEnabled: boolean;
    aiAgentReviewsEnabled: boolean;
    aiAgentReviewsAvailable: boolean;
    defaultAiAgentModelConfig: AiAgentModelConfig | null;
    defaultAiAgentModelOptions: AiModelOption[];
    dataAppCodingAgent: DataAppCodingAgent;
    visibleDataAppModels: DataAppClaudeModel[];
    // Org retention ceiling, surfaced so agent editors can see what caps
    // their agent-level window. Optional for backwards compatibility.
    threadRetentionHours?: number | null;
};

export type ApiAiOrganizationRuntimeSettingsResponse =
    ApiSuccess<AiOrganizationRuntimeSettings>;

export type ApiUpdateAiOrganizationSettingsResponse =
    ApiSuccess<AiOrganizationSettings>;

/**
 * What an org-level retention window of `retentionHours` would delete on the
 * next cleanup run. Backs the confirmation dialog shown before lowering the
 * org ceiling.
 */
export type AiThreadRetentionPreview = {
    threadCount: number;
    agentCount: number;
};

export type ApiAiThreadRetentionPreviewResponse =
    ApiSuccess<AiThreadRetentionPreview>;
