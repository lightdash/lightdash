import {
    type ApiError,
    type ApiSaveExternalConnectionSampleRequest,
    type ExternalConnectionSample,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type SaveSampleParams = {
    projectUuid: string;
    connectionUuid: string;
} & ApiSaveExternalConnectionSampleRequest;

const saveSample = async ({
    projectUuid,
    connectionUuid,
    ...body
}: SaveSampleParams): Promise<ExternalConnectionSample> =>
    lightdashApi<ExternalConnectionSample>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/samples`,
        body: JSON.stringify(body),
    });

export const useSaveConnectionSample = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('sync');
    return useMutation<ExternalConnectionSample, ApiError, SaveSampleParams>({
        mutationFn: saveSample,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [
                    'external-connection-samples',
                    variables.projectUuid,
                    variables.connectionUuid,
                ],
            });
            showToastSuccess({
                title: t('externalConnections.toasts.sampleSaved'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('externalConnections.toasts.sampleSaveFailed'),
                apiError: error,
            });
        },
    });
};
