import { LanguageModelMiddleware } from 'ai';

// Chat Completions rejects `parallel_tool_calls` on requests without tools,
// which is every structured-output call (titles, suggestions, tooltips).
export const dropParallelToolCallsWithoutTools: LanguageModelMiddleware = {
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
