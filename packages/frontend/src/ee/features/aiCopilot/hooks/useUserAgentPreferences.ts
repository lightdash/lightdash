import {
    type AiAgentUserPreferencesWithDefaults,
    type ApiAiAgentExploreAccessSummaryResponse,
    type ApiError,
    type ApiGetUserAgentPreferencesResponse,
    type ApiSuccessEmpty,
    type ApiUpdateUserAgentPreferences,
    type ApiUpdateUserAgentPreferencesResponse,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const USER_AGENT_PREFERENCES = 'userAgentPreferences';

const getUserAgentPreferences = (projectUuid: string) =>
    lightdashApi<ApiGetUserAgentPreferencesResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/preferences`,
        method: 'GET',
        body: undefined,
    });

export const useGetUserAgentPreferences = (
    projectUuid?: string | null,
    options?: UseQueryOptions<
        ApiGetUserAgentPreferencesResponse['results'],
        ApiError
    >,
) => {
    return useQuery<ApiGetUserAgentPreferencesResponse['results'], ApiError>({
        queryKey: [USER_AGENT_PREFERENCES, projectUuid],
        queryFn: () => getUserAgentPreferences(projectUuid!),
        ...options,
        enabled: !!projectUuid && options?.enabled !== false,
    });
};

const getUserAgentPreferencesWithDefaults = async (
    projectUuid: string,
): Promise<AiAgentUserPreferencesWithDefaults> => {
    const response = await lightdashApi<any>({
        url: `/projects/${projectUuid}/aiAgents/preferences/with-defaults`,
        method: 'GET',
        body: undefined,
    });
    return response;
};

export const useGetUserAgentPreferencesWithDefaults = (
    projectUuid?: string | null,
    options?: UseQueryOptions<AiAgentUserPreferencesWithDefaults, ApiError>,
) => {
    return useQuery<AiAgentUserPreferencesWithDefaults, ApiError>({
        queryKey: ['userAgentPreferencesWithDefaults', projectUuid],
        queryFn: () => getUserAgentPreferencesWithDefaults(projectUuid!),
        ...options,
        enabled: !!projectUuid && options?.enabled !== false,
    });
};

const updateUserAgentPreferences = (
    projectUuid: string,
    data: ApiUpdateUserAgentPreferences,
) =>
    lightdashApi<ApiUpdateUserAgentPreferencesResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/preferences`,
        method: `POST`,
        body: JSON.stringify(data),
    });

export const useUpdateUserAgentPreferences = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ApiUpdateUserAgentPreferencesResponse['results'],
        ApiError,
        ApiUpdateUserAgentPreferences,
        { previousData: unknown }
    >({
        mutationFn: (data) => updateUserAgentPreferences(projectUuid, data),
        onMutate: async (data) => {
            await queryClient.cancelQueries({
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
            });

            const previousData = queryClient.getQueryData([
                USER_AGENT_PREFERENCES,
                projectUuid,
            ]);

            queryClient.setQueryData(
                [USER_AGENT_PREFERENCES, projectUuid],
                data,
            );

            return { previousData };
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
            });
            // Also invalidate preferences with defaults (used by homepage)
            void queryClient.invalidateQueries({
                queryKey: ['userAgentPreferencesWithDefaults', projectUuid],
            });
        },
        onError: ({ error }, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    [USER_AGENT_PREFERENCES, projectUuid],
                    context.previousData,
                );
            }
            showToastApiError({
                title: 'Failed to set agent as default',
                apiError: error,
            });
        },
    });
};

const deleteUserAgentPreferences = (projectUuid: string) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/aiAgents/preferences`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteUserAgentPreferences = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        void,
        { previousData: unknown }
    >({
        mutationFn: () => deleteUserAgentPreferences(projectUuid),
        onMutate: async () => {
            await queryClient.cancelQueries({
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
            });

            const previousData = queryClient.getQueryData([
                USER_AGENT_PREFERENCES,
                projectUuid,
            ]);

            queryClient.setQueryData(
                [USER_AGENT_PREFERENCES, projectUuid],
                null,
            );

            return { previousData };
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
            });
            // Also invalidate preferences with defaults (used by homepage)
            void queryClient.invalidateQueries({
                queryKey: ['userAgentPreferencesWithDefaults', projectUuid],
            });
        },
        onError: ({ error }, _variables, context) => {
            if (context?.previousData !== undefined) {
                queryClient.setQueryData(
                    [USER_AGENT_PREFERENCES, projectUuid],
                    context.previousData,
                );
            }
            showToastApiError({
                title: 'Failed to remove agent preferences',
                apiError: error,
            });
        },
    });
};

const getAgentExploreAccessSummary = (
    projectUuid: string,
    payload: { tags: string[] | null },
) =>
    lightdashApi<ApiAiAgentExploreAccessSummaryResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/explore-access-summary`,
        method: 'POST',
        body: JSON.stringify(payload),
    });

export const useGetAgentExploreAccessSummary = (
    projectUuid: string,
    payload: { tags: string[] | null },
) => {
    return useQuery<
        ApiAiAgentExploreAccessSummaryResponse['results'],
        ApiError
    >({
        queryKey: [
            USER_AGENT_PREFERENCES,
            projectUuid,
            'exploreAccessSummary',
            payload.tags,
        ],
        queryFn: () => getAgentExploreAccessSummary(projectUuid, payload),
    });
};
