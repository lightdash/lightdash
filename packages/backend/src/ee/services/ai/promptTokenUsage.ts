import {
    type AiPromptTokenUsage,
    type AiPromptTokenUsageUpdate,
} from '@lightdash/common';

// `totalTokens` is cumulative billing spend; only `finalStepTotalTokens`
// approximates the context resident in the last request.
export const initialPromptTokenUsage = (
    initialTotalTokens: number,
): AiPromptTokenUsageUpdate => ({
    totalTokens: initialTotalTokens,
    finalStepTotalTokens: 0,
});

export const accumulatePromptTokenUsage = (
    previous: AiPromptTokenUsageUpdate,
    stepTotalTokens: number | null | undefined,
): AiPromptTokenUsageUpdate => {
    const stepTokens = Number.isFinite(stepTotalTokens)
        ? Number(stepTotalTokens)
        : 0;
    return {
        totalTokens: previous.totalTokens + stepTokens,
        finalStepTotalTokens: stepTokens,
    };
};

/** For modes that persist only the final step's usage, both figures coincide. */
export const finalStepPromptTokenUsage = (
    totalTokens: number | null | undefined,
): AiPromptTokenUsageUpdate => {
    const tokens = Number.isFinite(totalTokens) ? Number(totalTokens) : 0;
    return { totalTokens: tokens, finalStepTotalTokens: tokens };
};

// Legacy rows fall back to totalTokens: exact for every mode but deep research,
// where it over-reports for one turn — safer than risking a window overflow.
export const getContextOccupancyTokens = (
    tokenUsage: AiPromptTokenUsage | null | undefined,
): number | null => {
    if (!tokenUsage) {
        return null;
    }
    if (Number.isFinite(tokenUsage.finalStepTotalTokens)) {
        return Number(tokenUsage.finalStepTotalTokens);
    }
    return Number.isFinite(tokenUsage.totalTokens)
        ? tokenUsage.totalTokens
        : null;
};
