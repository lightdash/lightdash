import {
    getQueryCostEstimateSettings,
    type ApiError,
    type EstimateAsyncMetricQueryRequestParams,
    type EstimateAsyncSqlQueryRequestParams,
    type QueryCostEstimate,
    type QueryCostEstimateSettings,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useWarehouseSignInExecution } from '../components/NavBar/warehouseSignInPreflight';
import useIsEmbedded from '../ee/providers/Embed/useIsEmbedded';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { convertDateFilters } from '../utils/dateFilter';
import { useExploreSignInExecution } from './useExploreSignInExecution';
import { useProject } from './useProject';
import type { QueryResultsProps } from './useQueryResults';

const ESTIMATE_STALE_TIME_MS = 5 * 60 * 1000;
const ESTIMATE_DEBOUNCE_MS = 500;

/** Null unless the project's connection supports and enables dry-run estimates. */
export const useQueryCostEstimateSettings = (
    projectUuid: string | undefined,
): QueryCostEstimateSettings | null => {
    // Estimates are for signed-in users; embeds never request them.
    const isEmbedded = useIsEmbedded();
    const { data: project } = useProject(isEmbedded ? undefined : projectUuid);
    const settings = project?.warehouseConnection
        ? getQueryCostEstimateSettings(project.warehouseConnection)
        : null;
    return settings?.estimateQueryBytes ? settings : null;
};

/** Saved-chart runs are not estimated; only ad-hoc explorer queries are. */
export const getMetricQueryEstimateBody = (
    data: QueryResultsProps,
): EstimateAsyncMetricQueryRequestParams | null => {
    if (!data.query || data.chartUuid) return null;
    return {
        query: {
            ...data.query,
            filters: convertDateFilters(data.query.filters),
            timezone: data.query.timezone ?? undefined,
            exploreName: data.tableId,
        },
        dateZoom: data.dateZoomGranularity
            ? { granularity: data.dateZoomGranularity }
            : undefined,
        usePreAggregateCache: data.usePreAggregateCache,
        parameters: data.parameters,
        pivotConfiguration: data.pivotConfiguration,
    };
};

const estimateMetricQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: EstimateAsyncMetricQueryRequestParams,
) =>
    lightdashApi<QueryCostEstimate>({
        url: `/projects/${projectUuid}/query/metric-query/estimate`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(body),
    });

const estimateSqlQuery = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: EstimateAsyncSqlQueryRequestParams,
) =>
    lightdashApi<QueryCostEstimate>({
        url: `/projects/${projectUuid}/query/sql/estimate`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(body),
    });

const metricEstimateKey = (
    projectUuid: string,
    body: EstimateAsyncMetricQueryRequestParams,
) => ['query-cost-estimate', 'metric', projectUuid, body];

const sqlEstimateKey = (
    projectUuid: string,
    body: EstimateAsyncSqlQueryRequestParams,
) => ['query-cost-estimate', 'sql', projectUuid, body];

export const fetchMetricQueryCostEstimate = (
    lightdashApi: LightdashApi,
    queryClient: QueryClient,
    projectUuid: string,
    body: EstimateAsyncMetricQueryRequestParams,
) =>
    queryClient.fetchQuery<QueryCostEstimate, ApiError>({
        queryKey: metricEstimateKey(projectUuid, body),
        queryFn: () => estimateMetricQuery(lightdashApi, projectUuid, body),
        staleTime: ESTIMATE_STALE_TIME_MS,
    });

export const fetchSqlQueryCostEstimate = (
    lightdashApi: LightdashApi,
    queryClient: QueryClient,
    projectUuid: string,
    body: EstimateAsyncSqlQueryRequestParams,
) =>
    queryClient.fetchQuery<QueryCostEstimate, ApiError>({
        queryKey: sqlEstimateKey(projectUuid, body),
        queryFn: () => estimateSqlQuery(lightdashApi, projectUuid, body),
        staleTime: ESTIMATE_STALE_TIME_MS,
    });

export const useMetricQueryCostEstimate = (
    projectUuid: string | undefined,
    body: EstimateAsyncMetricQueryRequestParams | null,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();

    const [debouncedBody] = useDebouncedValue(body, ESTIMATE_DEBOUNCE_MS);
    const signInReady = useExploreSignInExecution(
        projectUuid,
        debouncedBody?.query.exploreName,
        enabled && !!debouncedBody,
    );
    return useQuery<QueryCostEstimate, ApiError>({
        queryKey: metricEstimateKey(projectUuid ?? '', debouncedBody!),
        queryFn: () =>
            estimateMetricQuery(lightdashApi, projectUuid!, debouncedBody!),
        enabled: signInReady && enabled && !!projectUuid && !!debouncedBody,
        staleTime: ESTIMATE_STALE_TIME_MS,
        keepPreviousData: true,
        retry: false,
    });
};

export const useSqlQueryCostEstimate = (
    projectUuid: string | undefined,
    body: EstimateAsyncSqlQueryRequestParams | null,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();

    const [debouncedBody] = useDebouncedValue(body, ESTIMATE_DEBOUNCE_MS);
    const signInReady = useWarehouseSignInExecution(
        projectUuid,
        debouncedBody
            ? (debouncedBody.warehouseConnectionUuid ?? null)
            : undefined,
        enabled && !!debouncedBody,
    );
    return useQuery<QueryCostEstimate, ApiError>({
        queryKey: sqlEstimateKey(projectUuid ?? '', debouncedBody!),
        queryFn: () =>
            estimateSqlQuery(lightdashApi, projectUuid!, debouncedBody!),
        enabled:
            signInReady &&
            enabled &&
            !!projectUuid &&
            !!debouncedBody?.sql.trim().length,
        staleTime: ESTIMATE_STALE_TIME_MS,
        keepPreviousData: true,
        retry: false,
    });
};
