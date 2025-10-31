import { ApiGetAsyncQueryResults, QueryHistoryStatus } from '@lightdash/common';

const MAX_POLL_ATTEMPTS = 120; // 2 minutes max

/**
 * Polls for async query results with exponential backoff
 * Similar to frontend's pollForResults in executeQuery.ts
 *
 * @param getAsyncQueryResults - Function to fetch query results
 * @param queryUuid - UUID of the query to poll
 * @param backoffMs - Current backoff delay in milliseconds (default: 250ms)
 * @returns Query results when ready
 * @throws Error if query fails, is cancelled, or times out
 */
export const pollAsyncQueryResults = async (
    getAsyncQueryResults: (
        queryUuid: string,
    ) => Promise<ApiGetAsyncQueryResults>,
    queryUuid: string,
    backoffMs: number = 250,
    attempts: number = 0,
): Promise<ApiGetAsyncQueryResults> => {
    if (attempts >= MAX_POLL_ATTEMPTS) {
        throw new Error('Query timed out waiting for results.');
    }

    const results = await getAsyncQueryResults(queryUuid);

    if (results.status === QueryHistoryStatus.READY) {
        return results;
    }

    if (results.status === QueryHistoryStatus.ERROR) {
        throw new Error(
            'error' in results && results.error
                ? results.error
                : 'Unknown error executing query.',
        );
    }

    if (results.status === QueryHistoryStatus.CANCELLED) {
        throw new Error('Query was cancelled.');
    }

    // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
    const nextBackoff = Math.min(backoffMs * 2, 1000);

    await new Promise((resolve) => {
        setTimeout(resolve, backoffMs);
    });

    return pollAsyncQueryResults(
        getAsyncQueryResults,
        queryUuid,
        nextBackoff,
        attempts + 1,
    );
};
