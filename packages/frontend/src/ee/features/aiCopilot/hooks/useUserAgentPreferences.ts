import {
    type ApiError,
    type ApiGetUserAgentPreferencesResponse,
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
        ApiUpdateUserAgentPreferences
    >({
        mutationFn: (data) => updateUserAgentPreferences(projectUuid, data),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to set agent as default',
                apiError: error,
            });
        },
    });
};
