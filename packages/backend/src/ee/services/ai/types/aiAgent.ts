import {
    AiAgent,
    AiAgentDocumentContext,
    AiDeepResearchBudget,
    AiMcpServer,
    AiMcpServerConnectionStatus,
    AiWritebackAttribution,
    ProjectContextEntry,
    WarehouseTypes,
    type AiDeepResearchExecutionContextSnapshot,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { ModelMessage } from 'ai';
import { AiKeyManagement } from '../../../../analytics/aiUsage';
import type { AiMcpCredentialPayload } from '../../../models/AiAgentModel';
import { AiModel, AiProvider } from '../models/types';
import { AiAgentSkillReference } from '../skills/types';
import type {
    MemorySearchEntry,
    ProjectContextSearchEntry,
} from '../tools/memoryProjectContext';
import {
    AnalyzeFieldImpactFn,
    ClosePullRequestFn,
    ConsumePromptSteersFn,
    CreateContentFn,
    CreateOrUpdateArtifactFn,
    CreateScheduledDeliveryFn,
    DescribeWarehouseTableFn,
    DiscoverReposFn,
    EditContentFn,
    EditDbtProjectFn,
    EditProjectContextFn,
    EditRepoFn,
    ExploreRepoFn,
    FindContentFn,
    FindExploresFn,
    FindFieldsFn,
    GetDashboardChartsFn,
    GetExploreFn,
    GetKnowledgeDocumentContentFn,
    GetProjectInfoFn,
    GetPromptFn,
    GetPullRequestDiffFn,
    GetSavedChartFn,
    GetVerifiedFieldUsageFn,
    IsPromptInterruptedFn,
    IsThreadSqlAutoApprovedFn,
    ListContentFn,
    ListExploresFn,
    ListKnowledgeDocumentsFn,
    ListProjectsFn,
    ListWarehouseTablesFn,
    ListWorkstreamsFn,
    LoadAgentSkillFn,
    ReadContentFn,
    ReadPinnedThreadFn,
    RecordSqlApprovalFn,
    ResolveUrlFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    RunSqlJobFn,
    SearchFieldValuesFn,
    SearchSemanticLayerFn,
    SendFileFn,
    SendSlackBlocksFn,
    SetupPreviewDeployFn,
    StoreReasoningFn,
    StoreToolCallErrorFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    SyncDbtProjectFn,
    TrackEventFn,
    UpdateProgressFn,
    UpdatePromptFn,
    UpdateSlackMessageFn,
    UpdateUserNameFn,
    ValidateContentFn,
    WaitForSqlApprovalFn,
} from './aiAgentDependencies';

type AnyAiModel<P = AiProvider> = P extends AiProvider ? AiModel<P> : never;

export type AiAgentMcpServer = AiMcpServer & {
    resolvedCredential: AiMcpCredentialPayload | null;
    resolvedCredentialScope: 'shared' | 'user' | null;
    oauthProvider?: OAuthClientProvider;
    enabledToolNames?: string[];
};

export type UnavailableMcpServer = {
    serverUuid: string;
    serverName: string;
    message: string;
    status: AiMcpServerConnectionStatus;
};

export type AiAgentRequestingUserRole = {
    name: string;
    isTechnical: boolean;
};

export type AiAgentRequestingUser = {
    name: string;
    role: AiAgentRequestingUserRole | null;
    groups: string[];
};

export type AiAgentExecutionConfig =
    | {
          mode: 'standard';
          maxSteps: number;
          budget?: never;
          onStepUsage?: never;
      }
    | {
          mode: 'deep_research';
          maxSteps: number;
          budget: AiDeepResearchBudget;
          onStepUsage?: (tokens: number) => void | Promise<void>;
          onExecutionContextResolved?: (
              snapshot: AiDeepResearchExecutionContextSnapshot,
          ) => void | Promise<void>;
      };

export type AiAgentArgs = AnyAiModel & {
    // Whether this turn runs on a Lightdash-managed or self-managed (BYO) key.
    // Stamped by the model builder and carried through for usage analytics.
    keyManagement: AiKeyManagement;
    agentSettings: AiAgent;
    requestingUser: AiAgentRequestingUser | null;
    knowledgeDocuments: AiAgentDocumentContext[];
    projectContext: ProjectContextEntry[];
    // Whether the project_context feature is on for this turn (Control = off).
    projectContextEnabled: boolean;
    aiAgentMemoryEnabled: boolean;
    mcpServers: AiAgentMcpServer[];
    messageHistory: ModelMessage[];
    promptUuid: string;
    threadUuid: string;
    organizationId: string;
    userId: string;
    debugLoggingEnabled: boolean;
    telemetryEnabled: boolean;
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;
    enableContentTools: boolean;
    enableAiWriteback: boolean;
    // Only on inside review-remediation work threads: lets the agent open/update
    // the project_context.yml PR via the deterministic editProjectContext tool.
    enableEditProjectContext: boolean;
    // Which GitHub identity a writeback PR would be attributed to (advisory,
    // resolved at prompt-assembly time). null when not applicable/unresolved.
    writebackAttribution: AiWritebackAttribution | null;
    enablePreviewDeploySetup: boolean;
    enableRepoDiscovery: boolean;
    // Experimental: swap the discoverFields sub-agent for a deterministic grep
    // over the in-memory annotated explores (the `grepFields` tool). Gated by
    // the `ai-grep-fields` feature flag.
    enableGrepFields: boolean;
    // Whether the general-purpose coding agent (`editRepo`) is available — the
    // CodingAgent flag, the org has a writable Git installation, and (in Slack)
    // a trusted prompt identity. Independent of enableAiWriteback.
    enableCodingAgent: boolean;
    // dbt project root within the repo (from project_sub_path); '.' = repo root,
    // null when repo discovery is off or the project is not git-backed.
    repoFsRoot: string | null;
    // Whether the repo host has server-side code search (GitHub yes, GitLab no).
    // Drives whether the prompt tells the agent to use `search`.
    repoFsSupportsCodeSearch: boolean;
    canRunSql: boolean;
    autoApproveSql: boolean;
    autoApproveSqlUserUuid: string | null;
    // When the modern Slack streaming card is driving progress, tools render
    // their state into the card instead of the legacy bolt-gif placeholder.
    useSlackStreamCard: boolean;
    // Originating Slack channel, so scheduling can target "this channel"
    // without asking. Null for web and MCP prompts.
    slackChannelId: string | null;
    warehouseType: WarehouseTypes | null;
    warehouseSchema: string | null;
    availableSkills: AiAgentSkillReference[];
    modelReasoningEnabled: boolean | null;

    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    toolDescriptionMaxChars: number;
    getDashboardChartsPageSize: number;
    maxQueryLimit: number;
    runSqlMaxLimit: number;
    siteUrl: string;
    canManageAgent: boolean;
    toolHints: string[];
    execution: AiAgentExecutionConfig;
    /**
     * When true, the first tool hint is *forced* on the opening step
     * (toolChoice), not just suggested — used by the review Build-fix run to
     * guarantee the agent opens a PR via editDbtProject.
     */
    forceToolHints?: boolean;
};

export type PerformanceMetrics = {
    measureGenerateResponseTime: (durationMs: number) => void;
    measureStreamResponseTime: (durationMs: number) => void;
    measureStreamFirstChunk: (durationMs: number) => void;
    measureTTFT: (
        durationMs: number,
        model: string,
        mode: 'stream' | 'generate',
    ) => void;
};

export type AiAgentDependencies = {
    listExplores: ListExploresFn;
    // The whole cached project_context document.
    getProjectContextDocument: () => Promise<ProjectContextEntry[]>;
    getAiAgentMemoryContextEntries: () => Promise<MemorySearchEntry[]>;
    incrementAiAgentMemoryPulls: (
        entries: ProjectContextSearchEntry[],
    ) => Promise<void>;
    listContent: ListContentFn;
    findContent: FindContentFn;
    readContent: ReadContentFn;
    resolveUrl: ResolveUrlFn;
    editContent: EditContentFn;
    createContent: CreateContentFn;
    createScheduledDelivery: CreateScheduledDeliveryFn;
    updateUserName: UpdateUserNameFn;
    validateContent: ValidateContentFn;
    getDashboardCharts: GetDashboardChartsFn;
    findExplores: FindExploresFn;
    getVerifiedFieldUsage: GetVerifiedFieldUsageFn;
    findFields: FindFieldsFn;
    searchSemanticLayer: SearchSemanticLayerFn;
    analyzeFieldImpact: AnalyzeFieldImpactFn;
    getExplore: GetExploreFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    runSqlJob: RunSqlJobFn;
    listWarehouseTables: ListWarehouseTablesFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
    listKnowledgeDocuments: ListKnowledgeDocumentsFn;
    getKnowledgeDocumentContent: GetKnowledgeDocumentContentFn;
    readPinnedThread: ReadPinnedThreadFn;
    getSavedChart: GetSavedChartFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    sendSlackBlocks: SendSlackBlocksFn;
    updateSlackMessage: UpdateSlackMessageFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
    storeToolCall: StoreToolCallFn;
    storeToolCallError: StoreToolCallErrorFn;
    storeToolResults: StoreToolResultsFn;
    storeReasoning: StoreReasoningFn;
    isPromptInterrupted: IsPromptInterruptedFn;
    consumePromptSteers: ConsumePromptSteersFn;
    searchFieldValues: SearchFieldValuesFn;
    trackEvent: TrackEventFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    editDbtProject: EditDbtProjectFn;
    editProjectContext: EditProjectContextFn;
    editRepo: EditRepoFn;
    syncDbtProject: SyncDbtProjectFn;
    setupPreviewDeploy: SetupPreviewDeployFn;
    exploreRepo: ExploreRepoFn;
    discoverRepos: DiscoverReposFn;
    listWorkstreams: ListWorkstreamsFn;
    closePullRequest: ClosePullRequestFn;
    getPullRequestDiff: GetPullRequestDiffFn;
    listProjects: ListProjectsFn;
    getProjectInfo: GetProjectInfoFn;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    isThreadSqlAutoApproved: IsThreadSqlAutoApprovedFn;
    loadSkill: LoadAgentSkillFn;
    perf: PerformanceMetrics;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
