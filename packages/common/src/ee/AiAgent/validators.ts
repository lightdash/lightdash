import type { AgentSuggestion } from './types';

export function getValidAiQueryLimit(limit: number | null, maxLimit: number) {
    if (!limit) {
        return maxLimit;
    }

    return Math.min(limit, maxLimit);
}

export type SuggestionValidationCatalog = {
    exploreNames: Set<string>;
};

export type SuggestionValidationResult =
    | { valid: true }
    | { valid: false; reason: string };

// Drops chips whose `defaults.explore` doesn't point at an explore the user
// can actually reach. This is the floor — even if the system prompt drifts,
// the model literally cannot land a chip referencing a made-up explore.
export function validateAgentSuggestion(
    chip: AgentSuggestion,
    catalog: SuggestionValidationCatalog,
): SuggestionValidationResult {
    if (chip.defaults.explore !== null) {
        if (!catalog.exploreNames.has(chip.defaults.explore)) {
            return {
                valid: false,
                reason: `unknown explore "${chip.defaults.explore}"`,
            };
        }
    }
    return { valid: true };
}
