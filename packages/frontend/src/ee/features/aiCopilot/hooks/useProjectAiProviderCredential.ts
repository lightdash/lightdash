import {
    type ApiError,
    type ApiProjectAiCredentialResponse,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

const projectAiCredentialQueryKey = (projectUuid: string) =>
    ['project-ai-credential', projectUuid] as const;

export const useProjectAiProviderCredential = (projectUuid: string) =>
    useQuery<ApiProjectAiCredentialResponse['results'], ApiError>({
        queryKey: projectAiCredentialQueryKey(projectUuid),
        queryFn: () =>
            lightdashApi({
                url: `/projects/${projectUuid}/ai/provider-credential`,
                method: 'GET',
                body: undefined,
            }),
    });

export const useSetProjectAiProviderCredential = (projectUuid: string) => {
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
            showToastSuccess({
                title: i18n.t('toasts.projectCredential.updated', {
                    ns: 'aiAgent',
                }),
            });
            await queryClient.invalidateQueries(
                projectAiCredentialQueryKey(projectUuid),
            );
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.projectCredential.updateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};
