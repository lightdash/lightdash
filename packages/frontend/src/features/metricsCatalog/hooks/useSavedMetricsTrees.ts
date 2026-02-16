import type {
    ApiCreateMetricsTreePayload,
    ApiCreateMetricsTreeResponse,
    ApiError,
    ApiGetMetricsTreeResponse,
    ApiGetMetricsTreesResponse,
    ApiMetricsTreeLockResponse,
    ApiUpdateMetricsTreePayload,
    ApiUpdateMetricsTreeResponse,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
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
    queryOptions?: Partial<
        UseQueryOptions<ApiGetMetricsTreeResponse['results'], ApiError>
    >,
) => {
    return useQuery<ApiGetMetricsTreeResponse['results'], ApiError>({
        queryKey: ['metrics-tree-details', projectUuid, metricsTreeUuid],
        queryFn: () => getMetricsTreeDetails(projectUuid!, metricsTreeUuid!),
        enabled: !!projectUuid && !!metricsTreeUuid,
        ...queryOptions,
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

// --- Lock hooks ---

const acquireTreeLock = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<ApiMetricsTreeLockResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}/lock`,
        method: 'POST',
        body: undefined,
    });
};

export const useAcquireTreeLock = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiMetricsTreeLockResponse['results'],
        ApiError,
        { projectUuid: string; metricsTreeUuid: string }
    >({
        mutationKey: ['acquire-tree-lock'],
        mutationFn: ({ projectUuid, metricsTreeUuid }) =>
            acquireTreeLock(projectUuid, metricsTreeUuid),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            void queryClient.invalidateQueries({
                queryKey: ['metrics-trees', variables.projectUuid],
            });
        },
        onError: ({ error }, variables) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            showToastApiError({
                title: 'Failed to acquire edit lock',
                apiError: error,
            });
        },
    });
};

const releaseTreeLock = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<undefined>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}/lock`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useReleaseTreeLock = () => {
    const queryClient = useQueryClient();

    return useMutation<
        undefined,
        ApiError,
        { projectUuid: string; metricsTreeUuid: string }
    >({
        mutationKey: ['release-tree-lock'],
        mutationFn: ({ projectUuid, metricsTreeUuid }) =>
            releaseTreeLock(projectUuid, metricsTreeUuid),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            void queryClient.invalidateQueries({
                queryKey: ['metrics-trees', variables.projectUuid],
            });
        },
    });
};

const refreshTreeLockHeartbeat = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<undefined>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}/lock/heartbeat`,
        method: 'PUT',
        body: undefined,
    });
};

/**
 * Sends heartbeat requests to keep the edit lock alive.
 * Automatically starts/stops based on `enabled`.
 * Calls `onLockLost` if the heartbeat fails (lock expired or stolen).
 */
export const useTreeLockHeartbeat = (
    projectUuid: string | undefined,
    metricsTreeUuid: string | null,
    enabled: boolean,
    onLockLost?: () => void,
) => {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onLockLostRef = useRef(onLockLost);
    onLockLostRef.current = onLockLost;

    const sendHeartbeat = useCallback(async () => {
        if (!projectUuid || !metricsTreeUuid) return;
        try {
            await refreshTreeLockHeartbeat(projectUuid, metricsTreeUuid);
        } catch {
            onLockLostRef.current?.();
        }
    }, [projectUuid, metricsTreeUuid]);

    useEffect(() => {
        if (enabled && projectUuid && metricsTreeUuid) {
            // Send heartbeat every 60s (well within 2-minute expiry)
            intervalRef.current = setInterval(() => {
                void sendHeartbeat();
            }, 60_000);

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        }

        // Clear interval when disabled
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        return undefined;
    }, [enabled, projectUuid, metricsTreeUuid, sendHeartbeat]);
};

// --- Delete tree hook ---

const deleteSavedMetricsTree = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<undefined>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}`,
        method: 'DELETE',
        body: undefined,
    });
};

export const useDeleteSavedMetricsTree = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        undefined,
        ApiError,
        { projectUuid: string; metricsTreeUuid: string }
    >({
        mutationKey: ['delete-saved-metrics-tree'],
        mutationFn: ({ projectUuid, metricsTreeUuid }) =>
            deleteSavedMetricsTree(projectUuid, metricsTreeUuid),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ['metrics-trees', variables.projectUuid],
            });
            void queryClient.removeQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            showToastSuccess({ title: 'Metrics tree deleted successfully' });
        },
        onError: ({ error }, variables) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            showToastApiError({
                title: 'Failed to delete metrics tree',
                apiError: error,
            });
        },
    });
};

// --- Update tree hook ---

const updateSavedMetricsTree = async (
    projectUuid: string,
    metricsTreeUuid: string,
    payload: ApiUpdateMetricsTreePayload,
) => {
    return lightdashApi<ApiUpdateMetricsTreeResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}`,
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
};

export const useUpdateSavedMetricsTree = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiUpdateMetricsTreeResponse['results'],
        ApiError,
        {
            projectUuid: string;
            metricsTreeUuid: string;
            payload: ApiUpdateMetricsTreePayload;
        }
    >({
        mutationKey: ['update-saved-metrics-tree'],
        mutationFn: ({ projectUuid, metricsTreeUuid, payload }) =>
            updateSavedMetricsTree(projectUuid, metricsTreeUuid, payload),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({
                queryKey: [
                    'metrics-tree-details',
                    variables.projectUuid,
                    variables.metricsTreeUuid,
                ],
            });
            void queryClient.invalidateQueries({
                queryKey: ['metrics-trees', variables.projectUuid],
            });
            showToastSuccess({ title: 'Metrics tree updated successfully' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update metrics tree',
                apiError: error,
            });
        },
    });
};
