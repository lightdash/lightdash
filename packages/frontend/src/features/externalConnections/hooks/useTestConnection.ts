import {
    type ApiError,
    type ApiTestExternalConnectionRequest,
    type ExternalFetchResponse,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type TestConnectionParams = {
    projectUuid: string;
    connectionUuid: string;
} & ApiTestExternalConnectionRequest;

const testConnection = async ({
    projectUuid,
    connectionUuid,
    ...body
}: TestConnectionParams): Promise<ExternalFetchResponse> =>
    lightdashApi<ExternalFetchResponse>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/test`,
        body: JSON.stringify(body),
        sensitive: true,
    });

export const useTestConnection = () => {
    const { showToastApiError } = useToaster();
    const { t } = useTranslation('sync');
    return useMutation<ExternalFetchResponse, ApiError, TestConnectionParams>({
        mutationFn: testConnection,
        onError: ({ error }) => {
            showToastApiError({
                title: t('externalConnections.toasts.testFailed'),
                apiError: error,
            });
        },
    });
};
