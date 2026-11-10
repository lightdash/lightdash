import {
    APP_STATE_HISTORY_DEFAULT_LIMIT,
    type ApiError,
    type AppStateAdminOverview,
    type AppStateHistory,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
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

/**
 * Versions of one shared key, newest first, paged backwards with
 * `beforeVersion`. Fetched when a key is selected.
 */
export const useAppSharedStateHistory = (
    projectUuid: string,
    appUuid: string,
    key: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useInfiniteQuery<AppStateHistory, ApiError>({
        queryKey: ['app-state-admin-history', projectUuid, appUuid, key],
        queryFn: ({ pageParam }) =>
            lightdashApi<AppStateHistory>({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/state/shared/${encodeURIComponent(
                    key!,
                )}/history${
                    pageParam !== undefined ? `?beforeVersion=${pageParam}` : ''
                }`,
                body: undefined,
            }),
        getNextPageParam: (lastPage) => {
            const oldest = lastPage.versions[lastPage.versions.length - 1];
            // A short page means the history is exhausted; v1 is the floor
            return lastPage.versions.length >=
                APP_STATE_HISTORY_DEFAULT_LIMIT && (oldest?.version ?? 1) > 1
                ? oldest.version
                : undefined;
        },
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
