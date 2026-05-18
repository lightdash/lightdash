import {
    AiAgent,
    AiMcpServer,
    AiMcpServerConnectionStatus,
    WarehouseTypes,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { ModelMessage } from 'ai';
import type { AiMcpCredentialPayload } from '../../../models/AiAgentModel';
import { AiModel, AiProvider } from '../models/types';
import { AiAgentSkillReference } from '../skills/types';
import {
    CreateChangeFn,
    CreateFrontendToolExecutionFn,
    CreateOrUpdateArtifactFn,
    DescribeWarehouseTableFn,
    FindContentFn,
    FindExploresFn,
    FindFieldFn,
    GetDashboardChartsFn,
    GetExploreCompilerFn,
    GetExploreFn,
    GetPromptFn,
    GetSavedChartFn,
    ListExploresFn,
    ListWarehouseTablesFn,
    LoadAgentSkillFn,
    LoadAgentSkillResourceFn,
    RecordFrontendToolResultFn,
    RecordSqlApprovalFn,
    RunAsyncQueryFn,
    RunSqlJobFn,
    SearchFieldValuesFn,
    SendFileFn,
    SendSlackBlocksFn,
    StoreReasoningFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    TrackEventFn,
    UpdateProgressFn,
    UpdatePromptFn,
    UpdateSlackMessageFn,
    WaitForFrontendToolResultFn,
    WaitForSqlApprovalFn,
} from './aiAgentDependencies';

type AnyAiModel<P = AiProvider> = P extends AiProvider ? AiModel<P> : never;

export type AiAgentMcpServer = AiMcpServer & {
    resolvedCredential: AiMcpCredentialPayload | null;
    resolvedCredentialScope: 'shared' | 'user' | null;
    oauthProvider?: OAuthClientProvider;
};

export type UnavailableMcpServer = {
    serverUuid: string;
    serverName: string;
    message: string;
    status: AiMcpServerConnectionStatus;
};

export type AiAgentArgs = AnyAiModel & {
    agentSettings: AiAgent;
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
    canRunSql: boolean;
    warehouseType: WarehouseTypes | null;
    warehouseSchema: string | null;
    availableSkills: AiAgentSkillReference[];

    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    getDashboardChartsPageSize: number;
    maxQueryLimit: number;
    siteUrl: string;
    canManageAgent: boolean;
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
    findContent: FindContentFn;
    getDashboardCharts: GetDashboardChartsFn;
    findExplores: FindExploresFn;
    findFields: FindFieldFn;
    getExplore: GetExploreFn;
    getExploreCompiler: GetExploreCompilerFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSqlJob: RunSqlJobFn;
    listWarehouseTables: ListWarehouseTablesFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
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
    createChange: CreateChangeFn;
    createFrontendToolExecution: CreateFrontendToolExecutionFn;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    waitForFrontendToolResult: WaitForFrontendToolResultFn;
    recordFrontendToolResult: RecordFrontendToolResultFn;
    loadSkill: LoadAgentSkillFn;
    loadSkillResource: LoadAgentSkillResourceFn;
    perf: PerformanceMetrics;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
