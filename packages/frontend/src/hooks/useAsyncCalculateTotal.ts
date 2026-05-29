import {
    QueryHistoryStatus,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';

type StartCalculateTotalArgs = {
    projectUuid: string;
    sourceQueryUuid: string;
    invalidateCache?: boolean;
};

const startCalculateTotalQuery = ({
    projectUuid,
    sourceQueryUuid,
    invalidateCache,
}: StartCalculateTotalArgs) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/${sourceQueryUuid}/calculate-total`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            kind: 'columnTotal',
            invalidateCache,
        }),
    });

// Single wide row of totals. Keys are pivoted SQL column names for pivoted
// sources, plain metric field ids otherwise.
export type AsyncTotalsMap = Record<string, number>;

const fetchTotals = async (
    args: StartCalculateTotalArgs,
): Promise<AsyncTotalsMap> => {
    const { queryUuid } = await startCalculateTotalQuery(args);

    // Polling endpoint defaults to page=1, so the READY response already
    // contains the single totals row — no separate stream fetch needed.
    const query = await pollForResults(args.projectUuid, queryUuid);

    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error computing totals');
    }
    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status while polling totals');
    }

    const firstRow = query.rows[0];
    if (!firstRow) return {};

    // Flatten ResultRow cells (`{ value: { raw } }`) back to `{ key: raw }`.
    const flat: Record<string, unknown> = {};
    for (const [key, cell] of Object.entries(firstRow)) {
        flat[key] = cell?.value?.raw;
    }
    return flat as AsyncTotalsMap;
};

export const useAsyncCalculateTotal = ({
    projectUuid,
    sourceQueryUuid,
    enabled,
    invalidateCache,
}: {
    projectUuid: string | undefined;
    sourceQueryUuid: string | undefined;
    enabled: boolean;
    invalidateCache?: boolean;
}) =>
    useQuery<AsyncTotalsMap, ApiError>({
        queryKey: [
            'calculate_async_total',
            projectUuid,
            sourceQueryUuid,
            invalidateCache,
        ],
        queryFn: () => {
            if (!projectUuid || !sourceQueryUuid) {
                return Promise.reject(
                    new Error(
                        'Missing projectUuid or sourceQueryUuid for async totals',
                    ),
                );
            }
            return fetchTotals({
                projectUuid,
                sourceQueryUuid,
                invalidateCache,
            });
        },
        enabled: enabled && !!projectUuid && !!sourceQueryUuid,
        retry: false,
    });
