import { AiChatMessage } from '@lightdash/common';
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

export type AiAgentArgs = {
    openaiApiKey: string;
    promptUuid: string;
    agentName: string;
    instruction: string | null;
    messageHistory: AiChatMessage[];
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
