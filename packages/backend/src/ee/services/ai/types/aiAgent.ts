import {
    AiAgent,
    AiAgentDocumentSummary,
    AiMcpServer,
    AiMcpServerConnectionStatus,
    AiWritebackAttribution,
    ProjectContextEntry,
    WarehouseTypes,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { ModelMessage } from 'ai';
import type { AiMcpCredentialPayload } from '../../../models/AiAgentModel';
import { AiModel, AiProvider } from '../models/types';
import { AiAgentSkillReference } from '../skills/types';
import {
    CreateContentFn,
    CreateOrUpdateArtifactFn,
    DescribeWarehouseTableFn,
    DiscoverReposFn,
    EditContentFn,
    EditDbtProjectFn,
    ExploreRepoFn,
    FindContentFn,
    FindExploresFn,
    FindFieldFn,
    GetDashboardChartsFn,
    GetExploreFn,
    GetKnowledgeDocumentContentFn,
    GetProjectInfoFn,
    GetPromptFn,
    GetSavedChartFn,
    ListContentFn,
    ListExploresFn,
    ListKnowledgeDocumentsFn,
    ListProjectsFn,
    ListWarehouseTablesFn,
    LoadAgentSkillFn,
    ReadContentFn,
    ReadPinnedThreadFn,
    RecordSqlApprovalFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    RunSqlJobFn,
    SearchFieldValuesFn,
    SearchSemanticLayerFn,
    SendFileFn,
    SendSlackBlocksFn,
    SetupPreviewDeployFn,
    StoreReasoningFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    TrackEventFn,
    UpdateProgressFn,
    UpdatePromptFn,
    UpdateSlackMessageFn,
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

export type AiAgentArgs = AnyAiModel & {
    agentSettings: AiAgent;
    knowledgeDocuments: AiAgentDocumentSummary[];
    projectContext: ProjectContextEntry[];
    // Whether the project_context feature is on for this turn (Control = off).
    projectContextEnabled: boolean;
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
    enableSearchSemanticLayer: boolean;
    enableAiWriteback: boolean;
    // Which GitHub identity a writeback PR would be attributed to (advisory,
    // resolved at prompt-assembly time). null when not applicable/unresolved.
    writebackAttribution: AiWritebackAttribution | null;
    enablePreviewDeploySetup: boolean;
    enableRepoDiscovery: boolean;
    // dbt project root within the repo (from project_sub_path); '.' = repo root,
    // null when repo discovery is off or the project is not git-backed.
    repoFsRoot: string | null;
    canRunSql: boolean;
    autoApproveSql: boolean;
    autoApproveSqlUserUuid: string | null;
    warehouseType: WarehouseTypes | null;
    warehouseSchema: string | null;
    availableSkills: AiAgentSkillReference[];
    enableAgentRevamp: boolean;

    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    getDashboardChartsPageSize: number;
    maxQueryLimit: number;
    runSqlMaxLimit: number;
    siteUrl: string;
    canManageAgent: boolean;
    toolHints: string[];
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
    listContent: ListContentFn;
    findContent: FindContentFn;
    readContent: ReadContentFn;
    editContent: EditContentFn;
    createContent: CreateContentFn;
    validateContent: ValidateContentFn;
    getDashboardCharts: GetDashboardChartsFn;
    findExplores: FindExploresFn;
    findFields: FindFieldFn;
    searchSemanticLayer: SearchSemanticLayerFn;
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
    storeToolResults: StoreToolResultsFn;
    storeReasoning: StoreReasoningFn;
    searchFieldValues: SearchFieldValuesFn;
    trackEvent: TrackEventFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    editDbtProject: EditDbtProjectFn;
    setupPreviewDeploy: SetupPreviewDeployFn;
    exploreRepo: ExploreRepoFn;
    discoverRepos: DiscoverReposFn;
    listProjects: ListProjectsFn;
    getProjectInfo: GetProjectInfoFn;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    loadSkill: LoadAgentSkillFn;
    perf: PerformanceMetrics;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
