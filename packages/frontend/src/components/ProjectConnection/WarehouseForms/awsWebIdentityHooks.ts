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
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useAwsWebIdentity = (enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAwsWebIdentityResponse['results'], ApiError>({
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
};

export const useCreateAwsWebIdentityAudience = (
    options: UseMutationOptions<
        ApiAwsWebIdentityAudienceResponse['results'],
        ApiError,
        CreateAwsWebIdentityAudience
    >,
) => {
    const lightdashApi = useLightdashApi();
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
