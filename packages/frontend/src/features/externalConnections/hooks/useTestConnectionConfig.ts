import {
    type ApiError,
    type CreateExternalConnection,
    type ExternalConnectionMethod,
    type ExternalFetchResponse,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type TestConfigParams = {
    projectUuid: string;
    config: CreateExternalConnection;
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

/** Test an unsaved connection config (incl. plaintext secret) before creating
 *  it. Used by the onboarding wizard's test step. */
const testConnectionConfig = async ({
    projectUuid,
    ...body
}: TestConfigParams): Promise<ExternalFetchResponse> =>
    lightdashApi<ExternalFetchResponse>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/test-config`,
        body: JSON.stringify(body),
    });

export const useTestConnectionConfig = () => {
    const { showToastApiError } = useToaster();
    return useMutation<ExternalFetchResponse, ApiError, TestConfigParams>({
        mutationFn: testConnectionConfig,
        onError: ({ error }) => {
            showToastApiError({
                title: 'Test request failed',
                apiError: error,
            });
        },
    });
};
