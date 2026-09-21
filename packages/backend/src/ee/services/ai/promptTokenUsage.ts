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

/** Preserve whole-run usage separately from final-step context occupancy. */
export const completedPromptTokenUsage = (
    totalTokens: number | null | undefined,
    finalStepTotalTokens: number | null | undefined = totalTokens,
): AiPromptTokenUsageUpdate => {
    const finalTokens = Number.isFinite(finalStepTotalTokens)
        ? Number(finalStepTotalTokens)
        : 0;
    return {
        // If a provider omits aggregate usage, retain the known final step.
        totalTokens: Number.isFinite(totalTokens)
            ? Number(totalTokens)
            : finalTokens,
        finalStepTotalTokens: finalTokens,
    };
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
