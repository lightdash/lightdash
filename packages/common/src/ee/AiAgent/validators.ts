export function getValidAiQueryLimit(limit: number | null, maxLimit: number) {
    if (!limit) {
        return maxLimit;
    }

    if (limit > maxLimit) {
        throw new Error(
            `The limit provided is greater than the maximum allowed limit of ${maxLimit}`,
        );
    }

    return limit;
}
