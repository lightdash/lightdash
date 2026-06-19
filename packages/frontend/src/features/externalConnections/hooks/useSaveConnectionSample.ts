import {
    type ApiError,
    type ApiSaveExternalConnectionSampleRequest,
    type ExternalConnectionSample,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
            showToastSuccess({ title: 'Sample saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save sample',
                apiError: error,
            });
        },
    });
};
