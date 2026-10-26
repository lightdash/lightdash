export const AI_DEFAULT_MAX_QUERY_LIMIT = 5000;

// Range an organization may pick for its own max query limit.
export const MIN_AI_MAX_QUERY_LIMIT = 1;
export const MAX_AI_MAX_QUERY_LIMIT = 100_000;

export const isValidAiMaxQueryLimit = (value: number | null): boolean =>
    value === null ||
    (Number.isInteger(value) &&
        value >= MIN_AI_MAX_QUERY_LIMIT &&
        value <= MAX_AI_MAX_QUERY_LIMIT);
