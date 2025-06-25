import { CoreMessage, LanguageModelV1 } from 'ai';
import {
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SearchFieldsFn,
    SendFileFn,
    StoreToolCallFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from './aiAgentDependencies';
import { AiAgentExploreSummary } from './aiAgentExploreSummary';

export type AiAgentArgs = {
    model: LanguageModelV1;
    promptUuid: string;
    agentName: string;
    instruction: string | null;
    messageHistory: CoreMessage[];
    aiAgentExploreSummaries: AiAgentExploreSummary[];
    maxLimit: number;
};

export type AiAgentDependencies = {
    getExplore: GetExploreFn;
    searchFields: SearchFieldsFn | undefined;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    updatePrompt: UpdatePromptFn;
    updateProgress: UpdateProgressFn;
    storeToolCall: StoreToolCallFn;
};

export type AiGenerateAgentResponseArgs = AiAgentArgs;

export type AiStreamAgentResponseArgs = AiAgentArgs;
