import { AiAgent } from '@lightdash/common';
import { ModelMessage } from 'ai';
import { AiModel } from '../models/types';
import {
    AppendInstructionFn,
    CreateOrUpdateArtifactFn,
    FindChartsFn,
    FindDashboardsFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    StoreToolCallFn,
    StoreToolResultsFn,
    TrackEventFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from './aiAgentDependencies';

export type AiAgentArgs<P extends string = string> = AiModel<P> & {
    agentSettings: AiAgent;
    messageHistory: ModelMessage[];
    promptUuid: string;
    threadUuid: string;
    organizationId: string;
    userId: string;
    debugLoggingEnabled: boolean;
    telemetryEnabled: boolean;
    enableDataAccess: boolean;

    availableExploresPageSize: number;
    findExploresPageSize: number;
    findExploresFieldOverviewSearchSize: number;
    findExploresFieldSearchSize: number;
    findExploresMaxDescriptionLength: number;
    findFieldsPageSize: number;
    findDashboardsPageSize: number;
    findChartsPageSize: number;
    maxQueryLimit: number;
    siteUrl?: string;
    canManageAgent: boolean;
};

export type AiAgentDependencies = {
    findCharts: FindChartsFn;
    findDashboards: FindDashboardsFn;
    findExplores: FindExploresFn;
    findFields: FindFieldFn;
    getExplore: GetExploreFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
    storeToolCall: StoreToolCallFn;
    storeToolResults: StoreToolResultsFn;
    trackEvent: TrackEventFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    appendInstruction: AppendInstructionFn;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
