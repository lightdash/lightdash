import type {
    ApiError,
    ApiGetAllMetricsTreeEdges,
    ApiMetricsTreeEdgePayload,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getAllMetricsTreeEdges = async (projectUuid: string | undefined) => {
    return lightdashApi<ApiGetAllMetricsTreeEdges['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/tree/edges`,
        method: 'GET',
        body: undefined,
    });
};

export const useAllMetricsTreeEdges = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<ApiGetAllMetricsTreeEdges['results'], ApiError>,
) => {
    return useQuery<ApiGetAllMetricsTreeEdges['results'], ApiError>({
        queryKey: ['all-metrics-tree-edges', projectUuid],
        queryFn: () => getAllMetricsTreeEdges(projectUuid),
        enabled: !!projectUuid,
        staleTime: 1000 * 60 * 5, // 5 minutes - edges don't change often
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
        // No cache invalidation - the edge is already visible in react-flow's UI
        // Cache will be updated on next page load or navigation
    });
};

const deleteMetricsTreeEdge = async (
    payload: ApiMetricsTreeEdgePayload & { projectUuid: string },
) => {
    return lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${payload.projectUuid}/dataCatalog/metrics/tree/edges/${payload.sourceCatalogSearchUuid}/${payload.targetCatalogSearchUuid}`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useDeleteMetricsTreeEdge = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        ApiMetricsTreeEdgePayload & { projectUuid: string }
    >({
        mutationKey: ['delete-metrics-tree-edge'],
        mutationFn: deleteMetricsTreeEdge,
        onSuccess: (_, variables) => {
            // Optimistically remove the edge from cache without refetching
            // This keeps nodes visible even after their edges are deleted
            queryClient.setQueryData<ApiGetAllMetricsTreeEdges['results']>(
                ['all-metrics-tree-edges', variables.projectUuid],
                (oldData) => {
                    if (!oldData) return oldData;
                    return {
                        edges: oldData.edges.filter(
                            (edge) =>
                                !(
                                    edge.source.catalogSearchUuid ===
                                        variables.sourceCatalogSearchUuid &&
                                    edge.target.catalogSearchUuid ===
                                        variables.targetCatalogSearchUuid
                                ),
                        ),
                    };
                },
            );
        },
    });
};
