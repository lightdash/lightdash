export function getValidAiQueryLimit(limit: number | null, maxLimit: number) {
    if (!limit) {
        return maxLimit;
    }

    return Math.min(limit, maxLimit);
}
