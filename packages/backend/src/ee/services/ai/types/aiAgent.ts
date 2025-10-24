import { AiAgent } from '@lightdash/common';
import { ModelMessage } from 'ai';
import { AiModel, AiProvider } from '../models/types';
import {
    CreateChangeFn,
    CreateOrUpdateArtifactFn,
    FindChartsFn,
    FindContentFn,
    FindDashboardsFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreCompilerFn,
    GetExploreFn,
    GetPromptFn,
    ListExploresFn,
    RunMiniMetricQueryFn,
    RunSavedChartQueryFn,
    SearchFieldValuesFn,
    SendFileFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    TrackEventFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from './aiAgentDependencies';

type AnyAiModel<P = AiProvider> = P extends AiProvider ? AiModel<P> : never;

export type AiAgentArgs = AnyAiModel & {
    agentSettings: AiAgent;
    messageHistory: ModelMessage[];
    promptUuid: string;
    threadUuid: string;
    organizationId: string;
    userId: string;
    debugLoggingEnabled: boolean;
    telemetryEnabled: boolean;
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;

    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    findDashboardsPageSize: number;
    findChartsPageSize: number;
    maxQueryLimit: number;
    siteUrl: string;
    canManageAgent: boolean;
};

export type PerformanceMetrics = {
    measureGenerateResponseTime: (durationMs: number) => void;
    measureStreamResponseTime: (durationMs: number) => void;
};

export type AiAgentDependencies = {
    listExplores: ListExploresFn;
    findContent: FindContentFn;
    findCharts: FindChartsFn;
    findDashboards: FindDashboardsFn;
    findExplores: FindExploresFn;
    findFields: FindFieldFn;
    getExplore: GetExploreFn;
    getExploreCompiler: GetExploreCompilerFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
    storeToolCall: StoreToolCallFn;
    storeToolResults: StoreToolResultsFn;
    searchFieldValues: SearchFieldValuesFn;
    trackEvent: TrackEventFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    createChange: CreateChangeFn;
    perf: PerformanceMetrics;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
