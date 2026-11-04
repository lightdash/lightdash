import { type ApiError, type ApiSshKeyPairResponse } from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useCreateSshKeyPair = (
    options: UseMutationOptions<ApiSshKeyPairResponse['results'], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<ApiSshKeyPairResponse['results'], ApiError>(
        async () =>
            lightdashApi({
                method: 'POST',
                url: '/ssh/key-pairs',
                body: undefined,
            }),
        {
            mutationKey: ['activeSshKeypair'],
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create SSH keypair',
                    apiError: error,
                });
            },
            ...options,
        },
    );
};
