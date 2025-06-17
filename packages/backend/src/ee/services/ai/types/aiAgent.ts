import { CoreMessage } from 'ai';
import {
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SearchFieldsFn,
    SendFileFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from './aiAgentDependencies';
import { AiAgentExploreSummary } from './aiAgentExploreSummary';

export type AiAgentProvider = 'anthropic' | 'openai';

export type AiAgentProviderConfig<P extends AiAgentProvider = AiAgentProvider> =
    {
        [key in P]?: {
            apiKey: string;
        };
    };

export type AiAgentArgs<P extends AiAgentProvider = AiAgentProvider> = {
    provider: P;
    modelName: string;
    providerConfig: AiAgentProviderConfig<P>;
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
};
