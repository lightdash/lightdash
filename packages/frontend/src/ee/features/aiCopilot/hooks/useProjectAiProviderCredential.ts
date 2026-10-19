import {
    type ApiError,
    type ApiProjectAiCredentialResponse,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const projectAiCredentialQueryKey = (projectUuid: string) =>
    ['project-ai-credential', projectUuid] as const;

export const useProjectAiProviderCredential = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiProjectAiCredentialResponse['results'], ApiError>({
        queryKey: projectAiCredentialQueryKey(projectUuid),
        queryFn: () =>
            lightdashApi({
                url: `/projects/${projectUuid}/ai/provider-credential`,
                method: 'GET',
                body: undefined,
            }),
    });
};

export const useSetProjectAiProviderCredential = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<undefined, ApiError, string | null>({
        mutationFn: (credentialUuid) =>
            lightdashApi({
                url: `/projects/${projectUuid}/ai/provider-credential`,
                method: 'PUT',
                body: JSON.stringify({ credentialUuid }),
            }),
        onSuccess: async () => {
            showToastSuccess({ title: 'Project AI credential updated' });
            await queryClient.invalidateQueries(
                projectAiCredentialQueryKey(projectUuid),
            );
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update project AI credential',
                apiError: error,
            }),
    });
};
