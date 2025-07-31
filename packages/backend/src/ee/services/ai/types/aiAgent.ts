import { AiAgent } from '@lightdash/common';
import { CoreMessage, LanguageModelV1 } from 'ai';
import {
    FindFieldFn,
    GetExploreFn,
    GetExploresFn,
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
    maxLimit: number;
    organizationId: string;
    userId: string;
    debugLoggingEnabled: boolean;
    __experimental__toolFindFields: boolean;
};

export type AiAgentDependencies = {
    findFields: FindFieldFn;
    getExplores: GetExploresFn;
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
