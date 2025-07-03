import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';

export function getValidAiQueryLimit(
    limit: number | null,
    maxLimit: number = AI_DEFAULT_MAX_QUERY_LIMIT, // ! Allow limit override
) {
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
