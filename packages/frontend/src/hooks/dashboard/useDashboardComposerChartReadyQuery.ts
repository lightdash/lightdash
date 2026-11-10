import {
    isComposerChartQueryResults,
    QueryExecutionContext,
    type ApiError,
    type ApiExecuteAsyncComposerChartQueryResults,
    type ApiExecuteAsyncDashboardChartQueryResultsVariant,
    type ExecuteAsyncDashboardChartRequestParams,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type LightdashApi } from '../../api';
import {
    selectInvalidateCache,
    selectIsAutoRefresh,
    selectRefreshCounter,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { useTileQueryQueue } from '../../features/dashboard/tileQueryQueue/useTileQueryQueue';
import { waitForQueryToFinish } from '../../features/dashboard/tileQueryQueue/waitForQueryToFinish';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useQueryRetryConfig } from '../useQueryRetry';
import useSearchParams from '../useSearchParams';

// Dashboard filters, sorts, date zoom and parameters do not reach a composer
// chart yet, so the request carries none and the key ignores them.
const executeComposerChartQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: ExecuteAsyncDashboardChartRequestParams,
): Promise<ApiExecuteAsyncComposerChartQueryResults> => {
    const response =
        await lightdashApi<ApiExecuteAsyncDashboardChartQueryResultsVariant>({
            url: `/projects/${projectUuid}/query/dashboard-chart`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify(data),
        });
    if (!isComposerChartQueryResults(response)) {
        throw new Error('The tile is a composer chart but the run was not');
    }
    return response;
};

export type DashboardComposerChartReadyQuery = {
    executeQueryResponse: ApiExecuteAsyncComposerChartQueryResults;
};

export const useDashboardComposerChartReadyQuery = (
    tileUuid: string,
    chartUuid: string,
    contextOverride?: QueryExecutionContext,
) => {
    const lightdashApi = useLightdashApi();
    const retryConfig = useQueryRetryConfig();
    const tileQueryQueue = useTileQueryQueue();
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardSelector(selectInvalidateCache);
    const refreshCounter = useDashboardSelector(selectRefreshCounter);
    const autoRefresh = useDashboardSelector(selectIsAutoRefresh);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
    );
    const markTileLoaded = useDashboardTileStatusContext(
        (c) => c.markTileLoaded,
    );
    const context =
        useSearchParams<QueryExecutionContext>('context') || undefined;

    const queryResult = useQuery<DashboardComposerChartReadyQuery, ApiError>({
        queryKey: [
            'dashboard_composer_chart_ready_query',
            projectUuid,
            chartUuid,
            dashboardUuid,
            contextOverride || context,
            autoRefresh,
            invalidateCache,
            refreshCounter,
        ],
        queryFn: async (queryContext) => {
            if (!projectUuid || !dashboardUuid) {
                throw new Error('Project or dashboard is undefined');
            }
            const releaseSlot = tileQueryQueue
                ? await tileQueryQueue.acquire(tileUuid, queryContext.signal)
                : undefined;
            const requestedContext =
                contextOverride || context || QueryExecutionContext.DASHBOARD;
            const executeQueryResponse = await executeComposerChartQuery(
                lightdashApi,
                projectUuid,
                {
                    context: autoRefresh
                        ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                        : requestedContext,
                    tileUuid,
                    chartUuid,
                    dashboardUuid,
                    dashboardFilters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    dashboardSorts: [],
                    invalidateCache,
                },
            ).catch((error: unknown) => {
                releaseSlot?.();
                throw error;
            });
            if (releaseSlot) {
                void waitForQueryToFinish(
                    lightdashApi,
                    projectUuid,
                    executeQueryResponse.queryUuid,
                ).then(releaseSlot);
            }
            return { executeQueryResponse };
        },
        enabled: Boolean(projectUuid && dashboardUuid),
        ...retryConfig,
        refetchOnMount: false,
    });

    // The tile takes no parameter inputs yet; the dashboard still needs it
    // to report in so the parameter controls can settle.
    const settled =
        queryResult.data !== undefined || queryResult.error !== null;
    useEffect(() => {
        if (!settled) return;
        addParameterReferences(tileUuid, null);
        markTileLoaded(tileUuid);
    }, [settled, addParameterReferences, markTileLoaded, tileUuid]);

    return queryResult;
};
