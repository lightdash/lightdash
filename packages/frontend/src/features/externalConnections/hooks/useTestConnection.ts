import {
    type ApiError,
    type ApiTestExternalConnectionRequest,
    type ExternalFetchResponse,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type TestConnectionParams = {
    projectUuid: string;
    connectionUuid: string;
} & ApiTestExternalConnectionRequest;

const testConnection = async (
    lightdashApi: LightdashApi,
    { projectUuid, connectionUuid, ...body }: TestConnectionParams,
): Promise<ExternalFetchResponse> =>
    lightdashApi<ExternalFetchResponse>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/test`,
        body: JSON.stringify(body),
        sensitive: true,
    });

export const useTestConnection = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<ExternalFetchResponse, ApiError, TestConnectionParams>({
        mutationFn: (args: TestConnectionParams) =>
            testConnection(lightdashApi, args),
        onError: ({ error }) => {
            showToastApiError({
                title: 'Test request failed',
                apiError: error,
            });
        },
    });
};
