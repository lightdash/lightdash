import type {
    ApiCreateMetricsTreePayload,
    ApiCreateMetricsTreeResponse,
    ApiError,
    ApiGetMetricsTreeResponse,
    ApiGetMetricsTreesResponse,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const getMetricsTrees = async (
    projectUuid: string,
    page: number,
    pageSize: number,
) => {
    return lightdashApi<ApiGetMetricsTreesResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees?page=${page}&pageSize=${pageSize}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTrees = (
    projectUuid: string | undefined,
    options?: { page?: number; pageSize?: number },
) => {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;

    return useQuery<ApiGetMetricsTreesResponse['results'], ApiError>({
        queryKey: ['metrics-trees', projectUuid, page, pageSize],
        queryFn: () => getMetricsTrees(projectUuid!, page, pageSize),
        enabled: !!projectUuid,
    });
};

const getMetricsTreeDetails = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<ApiGetMetricsTreeResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTreeDetails = (
    projectUuid: string | undefined,
    metricsTreeUuid: string | null,
) => {
    return useQuery<ApiGetMetricsTreeResponse['results'], ApiError>({
        queryKey: ['metrics-tree-details', projectUuid, metricsTreeUuid],
        queryFn: () => getMetricsTreeDetails(projectUuid!, metricsTreeUuid!),
        enabled: !!projectUuid && !!metricsTreeUuid,
    });
};

const createSavedMetricsTree = async (
    projectUuid: string,
    payload: ApiCreateMetricsTreePayload,
) => {
    return lightdashApi<ApiCreateMetricsTreeResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees`,
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const useCreateSavedMetricsTree = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiCreateMetricsTreeResponse['results'],
        ApiError,
        { projectUuid: string; payload: ApiCreateMetricsTreePayload }
    >({
        mutationKey: ['create-saved-metrics-tree'],
        mutationFn: ({ projectUuid, payload }) =>
            createSavedMetricsTree(projectUuid, payload),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ['metrics-trees', variables.projectUuid],
            });
            showToastSuccess({ title: 'Metrics tree saved successfully' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save metrics tree',
                apiError: error,
            });
        },
    });
};
