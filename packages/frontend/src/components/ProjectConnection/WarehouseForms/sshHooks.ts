import { ApiError, ApiSshKeyPairResponse } from '@lightdash/common';
import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const useCreateSshKeyPair = (
    options: UseMutationOptions<ApiSshKeyPairResponse['results'], ApiError>,
) => {
    const { showToastError } = useToaster();
    return useMutation<ApiSshKeyPairResponse['results'], ApiError>(
        async () =>
            lightdashApi({
                method: 'POST',
                url: '/ssh/key-pairs',
                body: undefined,
            }),
        {
            mutationKey: ['activeSshKeypair'],
            onError: (error) => {
                showToastError({
                    title: 'Failed to create SSH keypair',
                    subtitle: error.error.message,
                });
            },
            ...options,
        },
    );
};
