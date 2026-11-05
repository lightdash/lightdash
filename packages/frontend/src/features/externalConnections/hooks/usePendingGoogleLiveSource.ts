import {
    type ApiError,
    type ExternalConnection,
    type GoogleLiveSourcePendingChoice,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const pendingUrl = (projectUuid: string) =>
    `/ee/projects/${projectUuid}/live-sources/google/oauth/pending`;

/** What a Google sign-in that can read several properties is waiting for the admin to pick. */
export const usePendingGoogleLiveSource = (
    projectUuid: string,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<GoogleLiveSourcePendingChoice, ApiError>({
        queryKey: ['pending-google-live-source', projectUuid],
        queryFn: () =>
            lightdashApi<GoogleLiveSourcePendingChoice>({
                url: pendingUrl(projectUuid),
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });
};

export const useFinishGoogleLiveSource = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, string>({
        mutationFn: (choice) =>
            lightdashApi<ExternalConnection>({
                url: pendingUrl(projectUuid),
                method: 'POST',
                body: JSON.stringify({ choice }),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', projectUuid],
            });
            showToastSuccess({ title: 'Source connected' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not connect the source',
                apiError: error,
            });
        },
    });
};
