import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type RawResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import {
    cancelAsyncQuery,
    pollForResults,
} from '../../../features/queryRunner/executeQuery';
import { executeAsyncQuery } from '../../../hooks/useQueryResults';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import {
    buildAnalyticsQuery,
    type AnalyticsFilters,
    type AnalyticsQuerySpec,
} from './analyticsOverviewConfig';

export const useAnalyticsOverviewQuery = (
    projectUuid: string,
    spec: AnalyticsQuerySpec,
    filters: AnalyticsFilters,
) => {
    const api = useLightdashApi();
    const query = buildAnalyticsQuery(spec, filters);
    return useQuery({
        queryKey: ['analytics-settings', projectUuid, query],
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: false,
        queryFn: async ({ signal }): Promise<RawResultRow[]> => {
            const started = await executeAsyncQuery(
                api,
                {
                    projectUuid,
                    tableId: query.exploreName,
                    query,
                    context: QueryExecutionContext.DASHBOARD,
                },
                signal,
            );
            const cancel = () => {
                void cancelAsyncQuery(
                    api,
                    projectUuid,
                    started.queryUuid,
                ).catch(() => undefined);
            };
            signal?.addEventListener('abort', cancel, { once: true });
            try {
                if (signal?.aborted) {
                    cancel();
                    throw new DOMException('Query cancelled', 'AbortError');
                }
                const result = await pollForResults(
                    api,
                    projectUuid,
                    started.queryUuid,
                    250,
                    signal,
                );
                if (result.status !== QueryHistoryStatus.READY)
                    throw new Error('Unable to load analytics');
                return await api.getResultsFromStream<RawResultRow>(
                    `/api/v2/projects/${projectUuid}/query/${started.queryUuid}/results`,
                );
            } finally {
                signal?.removeEventListener('abort', cancel);
            }
        },
    });
};
