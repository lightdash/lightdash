export class DeepResearchInvestigationTargetReachedError extends Error {
    public readonly code = 'DEEP_RESEARCH_INVESTIGATION_TARGET_REACHED';
}

export const isDeepResearchInvestigationTargetReachedError = (
    error: unknown,
): error is DeepResearchInvestigationTargetReachedError =>
    error instanceof DeepResearchInvestigationTargetReachedError;
