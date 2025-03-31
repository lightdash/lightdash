import { type TokenUsage } from '@langchain/core/language_models/base';

export function getTotalTokenUsage(tokenUsages: TokenUsage[]) {
    return tokenUsages.reduce(
        (acc, curr) => {
            const accCompletionTokens = acc.completionTokens ?? 0;
            const accPromptTokens = acc.promptTokens ?? 0;
            const accTotalTokens = acc.totalTokens ?? 0;
            const currCompletionTokens = curr.completionTokens ?? 0;
            const currPromptTokens = curr.promptTokens ?? 0;
            const currTotalTokens = curr.totalTokens ?? 0;

            return {
                completionTokens: accCompletionTokens + currCompletionTokens,
                promptTokens: accPromptTokens + currPromptTokens,
                totalTokens: accTotalTokens + currTotalTokens,
            };
        },
        {
            completionTokens: 0,
            promptTokens: 0,
            totalTokens: 0,
        },
    );
}
