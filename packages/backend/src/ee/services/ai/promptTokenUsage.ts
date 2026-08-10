import { type AiPromptTokenUsage } from '@lightdash/common';

/**
 * `ai_prompt.token_usage` carries two distinct figures: `totalTokens` is the
 * cumulative billing spend across every step of a run, while
 * `finalStepTotalTokens` approximates the context resident in the last request.
 * Only the latter is comparable to a model's context window.
 */
export const initialPromptTokenUsage = (
    initialTotalTokens: number,
): AiPromptTokenUsage => ({
    totalTokens: initialTotalTokens,
    finalStepTotalTokens: 0,
});

export const accumulatePromptTokenUsage = (
    previous: AiPromptTokenUsage,
    stepTotalTokens: number | null | undefined,
): AiPromptTokenUsage => {
    const stepTokens = stepTotalTokens ?? 0;
    return {
        totalTokens: previous.totalTokens + stepTokens,
        finalStepTotalTokens: stepTokens,
    };
};

/**
 * For modes that persist only the final step's usage, both figures coincide.
 */
export const finalStepPromptTokenUsage = (
    totalTokens: number | null | undefined,
): AiPromptTokenUsage => {
    const tokens = totalTokens ?? 0;
    return { totalTokens: tokens, finalStepTotalTokens: tokens };
};

/**
 * Reads the context-occupancy figure out of a persisted usage record. Rows
 * written before `finalStepTotalTokens` existed fall back to `totalTokens`:
 * that is exact for every mode except deep research, where it over-reports and
 * reproduces the old over-eager compaction for one turn. Preferred over
 * skipping compaction, which would risk a hard context-window overflow.
 */
export const getContextOccupancyTokens = (
    tokenUsage: AiPromptTokenUsage | null | undefined,
): number | null => {
    if (!tokenUsage) {
        return null;
    }
    if (typeof tokenUsage.finalStepTotalTokens === 'number') {
        return tokenUsage.finalStepTotalTokens;
    }
    return typeof tokenUsage.totalTokens === 'number'
        ? tokenUsage.totalTokens
        : null;
};
