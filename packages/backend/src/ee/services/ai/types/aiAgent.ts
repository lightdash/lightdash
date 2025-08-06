import { AiAgent } from '@lightdash/common';
import { CoreMessage, LanguageModelV1 } from 'ai';
import {
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

export type AiAgentArgs = {
    model: LanguageModelV1;
    agentSettings: AiAgent;
    messageHistory: CoreMessage[];
    promptUuid: string;
    threadUuid: string;
    organizationId: string;
    userId: string;
    debugLoggingEnabled: boolean;

    availableExploresPageSize: number;
    findExploresPageSize: number;
    findExploresFieldOverviewSearchSize: number;
    findExploresFieldSearchSize: number;
    findExploresMaxDescriptionLength: number;
    findFieldsPageSize: number;
    findDashboardsPageSize: number;
    maxQueryLimit: number;
    siteUrl?: string;
};

export type AiAgentDependencies = {
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
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
