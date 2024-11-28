import type {
    ApiError,
    ApiGetMetricsTree,
    ApiMetricsTreeEdgePayload,
    ApiSuccessEmpty,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getMetricsTree = async (projectUuid: string | undefined) => {
    return lightdashApi<ApiGetMetricsTree>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/tree`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTree = (projectUuid: string | undefined) => {
    return useQuery<ApiGetMetricsTree['results'], ApiError>({
        queryKey: ['metrics-tree', projectUuid],
        queryFn: async () => (await getMetricsTree(projectUuid)).results,
        enabled: !!projectUuid,
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

// const deleteMetricsTreeEdge = async (
//     payload: ApiMetricsTreeEdgePayload & { projectUuid: string },
// ) => {
//     return lightdashApi<ApiSuccessEmpty>({
//         url: `/projects/${payload.projectUuid}/dataCatalog/metrics/tree/edges/${payload.sourceCatalogSearchUuid}/${payload.targetCatalogSearchUuid}`,
//         method: 'DELETE',
//         body: undefined,
//     });
// };

// export const useDeleteMetricsTreeEdge = () => {
//     return useMutation<
//         ApiSuccessEmpty,
//         ApiError,
//         ApiMetricsTreeEdgePayload & { projectUuid: string }
//     >({
//         mutationKey: ['delete-metrics-tree-edge'],
//         mutationFn: deleteMetricsTreeEdge,
//     });
// };
