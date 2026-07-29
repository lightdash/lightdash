import {
    type ApiError,
    type HomepageOpening,
    type ProjectHomepageSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const HOMEPAGE_SETTINGS_QUERY_KEY = 'project_homepage_settings';

const getSettings = async (projectUuid: string) =>
    lightdashApi<ProjectHomepageSettings>({
        url: `/projects/${projectUuid}/homepage/settings`,
        method: 'GET',
        body: undefined,
    });

const updateOpening = async (
    projectUuid: string,
    opening: HomepageOpening | null,
) =>
    lightdashApi<ProjectHomepageSettings>({
        url: `/projects/${projectUuid}/homepage/settings`,
        method: 'PATCH',
        body: JSON.stringify({ opening }),
    });

export const useHomepageSettings = (
    projectUuid: string | undefined,
    options: { enabled?: boolean } = {},
) =>
    useQuery<ProjectHomepageSettings, ApiError>({
        queryKey: [HOMEPAGE_SETTINGS_QUERY_KEY, projectUuid],
        queryFn: () => getSettings(projectUuid!),
        enabled: (options.enabled ?? true) && !!projectUuid,
    });

export const useUpdateHomepageOpening = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ProjectHomepageSettings,
        ApiError,
        HomepageOpening | null
    >({
        mutationFn: (opening) => updateOpening(projectUuid, opening),
        onSuccess: (settings) => {
            queryClient.setQueryData(
                [HOMEPAGE_SETTINGS_QUERY_KEY, projectUuid],
                settings,
            );
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to change the homepage opening',
                apiError: error,
            }),
    });
};
