import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type DeleteSampleParams = {
    projectUuid: string;
    connectionUuid: string;
    sampleUuid: string;
};

const deleteConnectionSample = async ({
    projectUuid,
    connectionUuid,
    sampleUuid,
}: DeleteSampleParams): Promise<undefined> =>
    lightdashApi<undefined>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/samples/${sampleUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteConnectionSample = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('sync');
    return useMutation<undefined, ApiError, DeleteSampleParams>({
        mutationFn: deleteConnectionSample,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [
                    'external-connection-samples',
                    variables.projectUuid,
                    variables.connectionUuid,
                ],
            });
            showToastSuccess({
                title: t('externalConnections.toasts.sampleDeleted'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('externalConnections.toasts.sampleDeleteFailed'),
                apiError: error,
            });
        },
    });
};
