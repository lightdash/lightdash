import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type RawResultRow,
} from '@lightdash/common';
import { useQueries, type QueryFunctionContext } from '@tanstack/react-query';
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

export const useAnalyticsOverviewQueries = (
    projectUuid: string,
    specs: AnalyticsQuerySpec[],
    filters: AnalyticsFilters,
    enabled = true,
) => {
    const api = useLightdashApi();
    const uniqueSpecs = [...new Set(specs)];
    const results = useQueries({
        queries: uniqueSpecs.map((spec) => {
            const query = buildAnalyticsQuery(spec, filters);
            return {
                queryKey: ['analytics-settings', projectUuid, query],
                enabled,
                staleTime: 5 * 60 * 1000,
                refetchOnWindowFocus: false,
                retry: false,
                queryFn: async ({
                    signal,
                }: QueryFunctionContext): Promise<RawResultRow[]> => {
                    signal?.throwIfAborted();
                    // Keep the query ID even if the filter changes during creation.
                    const started = await executeAsyncQuery(api, {
                        projectUuid,
                        tableId: query.exploreName,
                        query,
                        context: QueryExecutionContext.DASHBOARD,
                    });
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
                            signal.throwIfAborted();
                        }
                        const result = await pollForResults(
                            api,
                            projectUuid,
                            started.queryUuid,
                            250,
                            signal,
                        );
                        signal?.throwIfAborted();
                        if (result.status !== QueryHistoryStatus.READY)
                            throw new Error('Unable to load analytics');
                        if (result.nextPage !== undefined)
                            return await api.getResultsFromStream<RawResultRow>(
                                `/api/v2/projects/${projectUuid}/query/${started.queryUuid}/results`,
                            );
                        return result.rows.map((row) =>
                            Object.fromEntries(
                                Object.entries(row).map(([field, cell]) => [
                                    field,
                                    cell.value.raw,
                                ]),
                            ),
                        );
                    } finally {
                        signal?.removeEventListener('abort', cancel);
                    }
                },
            };
        }),
    });
    return specs.map((spec) => results[uniqueSpecs.indexOf(spec)]);
};

export type AnalyticsOverviewQueryResult = ReturnType<
    typeof useAnalyticsOverviewQueries
>[number];
