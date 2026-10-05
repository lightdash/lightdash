import {
    type ApiAwsWebIdentityAudienceResponse,
    type ApiAwsWebIdentityResponse,
    type ApiError,
    type CreateAwsWebIdentityAudience,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const useAwsWebIdentity = (enabled: boolean) =>
    useQuery<ApiAwsWebIdentityResponse['results'], ApiError>({
        queryKey: ['awsWebIdentity'],
        queryFn: () =>
            lightdashApi<ApiAwsWebIdentityResponse['results']>({
                url: '/aws/web-identity',
                method: 'GET',
                body: undefined,
            }),
        enabled,
        staleTime: Infinity,
    });

export const useCreateAwsWebIdentityAudience = (
    options: UseMutationOptions<
        ApiAwsWebIdentityAudienceResponse['results'],
        ApiError,
        CreateAwsWebIdentityAudience
    >,
) => {
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiAwsWebIdentityAudienceResponse['results'],
        ApiError,
        CreateAwsWebIdentityAudience
    >({
        mutationFn: (body) =>
            lightdashApi<ApiAwsWebIdentityAudienceResponse['results']>({
                method: 'POST',
                url: '/aws/web-identity/audiences',
                body: JSON.stringify(body),
            }),
        mutationKey: ['createAwsWebIdentityAudience'],
        onError: ({ error }) => {
            showToastApiError({
                title: "Couldn't generate an audience",
                apiError: error,
            });
        },
        ...options,
    });
};
