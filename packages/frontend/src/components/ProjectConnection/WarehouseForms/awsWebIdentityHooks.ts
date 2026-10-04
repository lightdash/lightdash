import {
    type ApiAwsWebIdentityAudienceResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const useCreateAwsWebIdentityAudience = (
    options: UseMutationOptions<
        ApiAwsWebIdentityAudienceResponse['results'],
        ApiError
    >,
) => {
    const { showToastApiError } = useToaster();
    return useMutation<ApiAwsWebIdentityAudienceResponse['results'], ApiError>(
        async () =>
            lightdashApi({
                method: 'POST',
                url: '/aws/web-identity/audiences',
                body: undefined,
            }),
        {
            mutationKey: ['createAwsWebIdentityAudience'],
            onError: ({ error }) => {
                showToastApiError({
                    title: "Couldn't generate an audience",
                    apiError: error,
                });
            },
            ...options,
        },
    );
};
