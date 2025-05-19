import type { ApiGetAsyncQueryResults } from '@lightdash/common';
import { QueryHistoryStatus } from '@lightdash/common';
import { lightdashApi } from '../../api';

export const pollForResults = async (
    projectUuid: string,
    queryUuid: string,
    backoffMs: number = 250,
): Promise<ApiGetAsyncQueryResults> => {
    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (results.status === QueryHistoryStatus.PENDING) {
        // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
        const nextBackoff = Math.min(backoffMs * 2, 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return pollForResults(projectUuid, queryUuid, nextBackoff);
    }

    return results;
};
