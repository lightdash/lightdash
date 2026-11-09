import {
    type ApiError,
    type AppStateAdminOverview,
    type AppStateHistory,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const overviewQueryKey = (projectUuid: string, appUuid: string) => [
    'app-state-admin-overview',
    projectUuid,
    appUuid,
];

/**
 * The manage view's picture of an app's stored state: shared-key metadata
 * without values, per-user volume only. The backend requires manage access.
 */
export const useAppStateAdminOverview = (
    projectUuid: string,
    appUuid: string,
    { enabled }: { enabled: boolean },
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AppStateAdminOverview, ApiError>({
        queryKey: overviewQueryKey(projectUuid, appUuid),
        queryFn: () =>
            lightdashApi<AppStateAdminOverview>({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/state/admin`,
                body: undefined,
            }),
        enabled,
        retry: false,
    });
};

/** Versions of one shared key, newest first. Fetched when a row expands. */
export const useAppSharedStateHistory = (
    projectUuid: string,
    appUuid: string,
    key: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AppStateHistory, ApiError>({
        queryKey: ['app-state-admin-history', projectUuid, appUuid, key],
        queryFn: () =>
            lightdashApi<AppStateHistory>({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/state/shared/${encodeURIComponent(
                    key!,
                )}/history`,
                body: undefined,
            }),
        enabled: key !== null,
        retry: false,
    });
};

/** Clear one shared key (manage permission). History is kept server-side. */
export const useDeleteAppSharedState = (
    projectUuid: string,
    appUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, { key: string }>({
        mutationFn: ({ key }) =>
            lightdashApi<undefined>({
                method: 'DELETE',
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/state/shared/${encodeURIComponent(
                    key,
                )}`,
                body: undefined,
            }),
        onSuccess: (_, { key }) => {
            void queryClient.invalidateQueries({
                queryKey: overviewQueryKey(projectUuid, appUuid),
            });
            showToastSuccess({ title: `Cleared "${key}"` });
        },
        onError: (apiError, { key }) => {
            showToastApiError({
                title: `Failed to clear "${key}"`,
                apiError: apiError.error,
            });
        },
    });
};
