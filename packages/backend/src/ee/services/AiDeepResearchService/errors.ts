/**
 * A Deep Research policy limit (runtime, tool, step, or warehouse-query cap)
 * stopped the investigation. The run finishes as partially completed with the
 * evidence collected so far; it is never retried.
 */
export class AiDeepResearchPolicyLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiDeepResearchPolicyLimitError';
    }
}

/**
 * A semantic failure retrying cannot fix (e.g. the researcher never submitted
 * a Research Artifact, or submitted an invalid one). The run is marked failed
 * terminally instead of being released for retry.
 */
export class AiDeepResearchPermanentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiDeepResearchPermanentError';
    }
}
