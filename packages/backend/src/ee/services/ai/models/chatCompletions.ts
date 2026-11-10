import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { ProviderOptionsMap } from './types';

// Chat Completions rejects `parallel_tool_calls` on requests without tools,
// which is every structured-output call (titles, suggestions, tooltips).
const dropParallelToolCallsWithoutTools: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
        if (params.tools && params.tools.length > 0) {
            return params;
        }
        const { openai, ...otherProviders } = params.providerOptions ?? {};
        if (!openai || !('parallelToolCalls' in openai)) {
            return params;
        }
        const { parallelToolCalls: _dropped, ...openaiOptions } = openai;
        return {
            ...params,
            providerOptions: { ...otherProviders, openai: openaiOptions },
        };
    },
};

export const withChatCompletionsDefaults = (
    model: Parameters<typeof wrapLanguageModel>[0]['model'],
) =>
    wrapLanguageModel({
        model,
        middleware: dropParallelToolCallsWithoutTools,
    });

// Chat Completions has no reasoning summaries, and GPT-5.5+ models reject
// function tools there unless reasoning_effort is explicitly 'none'.
export const getReasoningProviderOptions = ({
    useChatCompletions,
    responsesEffort,
    includeSummary,
}: {
    useChatCompletions: boolean;
    responsesEffort: 'low' | 'medium';
    includeSummary: boolean;
}): Pick<
    ProviderOptionsMap['openai'],
    'reasoningEffort' | 'reasoningSummary'
> => ({
    reasoningEffort: useChatCompletions ? 'none' : responsesEffort,
    ...(includeSummary &&
        !useChatCompletions && {
            reasoningSummary: 'auto',
        }),
});
