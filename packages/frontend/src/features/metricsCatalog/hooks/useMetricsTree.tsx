import type {
    ApiError,
    ApiGetMetricsTree,
    ApiMetricsTreeEdgePayload,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getMetricsTree = async (
    projectUuid: string | undefined,
    metricIds: string[],
) => {
    const queryParams = metricIds.length
        ? `?${new URLSearchParams(
              metricIds.map((metricId) => ['metricIds', metricId]),
          ).toString()}`
        : '';

    return lightdashApi<ApiGetMetricsTree['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/tree${queryParams}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTree = (
    projectUuid: string | undefined,
    metricIds: string[],
    options?: UseQueryOptions<ApiGetMetricsTree['results'], ApiError>,
) => {
    return useQuery<ApiGetMetricsTree['results'], ApiError>({
        queryKey: ['metrics-tree', projectUuid, metricIds],
        queryFn: () => getMetricsTree(projectUuid, metricIds),
        enabled: !!projectUuid,
        ...options,
    });
};

const createMetricsTreeEdge = async (
    payload: ApiMetricsTreeEdgePayload & { projectUuid: string },
) => {
    const { projectUuid, ...rest } = payload;

    return lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${payload.projectUuid}/dataCatalog/metrics/tree/edges`,
        method: 'POST',
        body: JSON.stringify(rest),
    });
};

export const useCreateMetricsTreeEdge = () => {
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        ApiMetricsTreeEdgePayload & { projectUuid: string }
    >({
        mutationKey: ['create-metrics-tree-edge'],
        mutationFn: createMetricsTreeEdge,
    });
};

const deleteMetricsTreeEdge = async (
    payload: ApiMetricsTreeEdgePayload & { projectUuid: string },
) => {
    return lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${payload.projectUuid}/dataCatalog/metrics/tree/edges/${payload.sourceMetricId}/${payload.targetMetricId}`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useDeleteMetricsTreeEdge = () => {
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        ApiMetricsTreeEdgePayload & { projectUuid: string }
    >({
        mutationKey: ['delete-metrics-tree-edge'],
        mutationFn: deleteMetricsTreeEdge,
    });
};
