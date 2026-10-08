export const AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES = 75;

/**
 * Tool call recording the Document a run published its report to. Model
 * providers replay it in thread history, so it uses only [a-zA-Z0-9_-].
 */
export const getAiDeepResearchDocumentToolCallId = (
    aiDeepResearchRunUuid: string,
): string => `deep-research-${aiDeepResearchRunUuid}-document`;
