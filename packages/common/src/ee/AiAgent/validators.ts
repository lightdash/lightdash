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

// Drops chips that point at things the user can't actually reach — explores
// they don't have, navigate URLs that didn't resolve. This is the floor —
// even if the system prompt drifts, the model literally cannot land a chip
// referencing a made-up explore or an unresolvable thread.
export function validateAgentSuggestion(
    chip: AgentSuggestion,
    catalog: SuggestionValidationCatalog,
): SuggestionValidationResult {
    if (chip.kind === 'navigate') {
        if (!chip.url || chip.url.length === 0) {
            return { valid: false, reason: 'navigate chip missing url' };
        }
        return { valid: true };
    }
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
