import {
    QueryHistoryStatus,
    type ApiGetAsyncQueryResults,
} from '@lightdash/common';
import { lightdashApi } from '../api';

const throwIfAborted = (signal: AbortSignal | undefined) => {
    if (signal?.aborted) {
        throw new DOMException('Query cancelled', 'AbortError');
    }
};

export const cancelAsyncQuery = async (
    projectUuid: string,
    queryUuid: string,
): Promise<void> => {
    await lightdashApi<undefined>({
        url: `/projects/${projectUuid}/query/${queryUuid}/cancel`,
        version: 'v2',
        method: 'POST',
        body: undefined,
    });
};

/** Polls an async query until it leaves the running states, backing off to one second. */
export const pollForResults = async (
    projectUuid: string,
    queryUuid: string,
    backoffMs: number = 250,
    signal?: AbortSignal,
): Promise<ApiGetAsyncQueryResults> => {
    throwIfAborted(signal);
    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (
        results.status === QueryHistoryStatus.PENDING ||
        results.status === QueryHistoryStatus.QUEUED ||
        results.status === QueryHistoryStatus.EXECUTING
    ) {
        const nextBackoff = Math.min(backoffMs * 2, 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        throwIfAborted(signal);
        return pollForResults(projectUuid, queryUuid, nextBackoff, signal);
    }

    return results;
};
