import {
    QueryHistoryStatus,
    type ApiGetAsyncQueryResults,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 1000;

const isRunning = (status: QueryHistoryStatus) =>
    status === QueryHistoryStatus.PENDING ||
    status === QueryHistoryStatus.QUEUED ||
    status === QueryHistoryStatus.EXECUTING;

/**
 * Resolves once the query stops running on the backend, however it ends. It
 * also resolves if the status can't be read, so a slot waiting on it can't leak.
 */
export const waitForQueryToFinish = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    queryUuid: string,
    backoffMs = INITIAL_BACKOFF_MS,
): Promise<void> => {
    try {
        // One row is enough to read the status.
        const { status } = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=1`,
            version: 'v2',
            method: 'GET',
        });
        if (!isRunning(status)) {
            return;
        }
    } catch {
        return;
    }

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    await waitForQueryToFinish(
        lightdashApi,
        projectUuid,
        queryUuid,
        Math.min(backoffMs * 2, MAX_BACKOFF_MS),
    );
};
