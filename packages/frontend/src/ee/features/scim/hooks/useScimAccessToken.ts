import {
    type ApiCreateScimTokenRequest,
    type ApiCreateScimTokenResponse,
    type ApiError,
    type ScimOrganizationAccessToken,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import useQueryError from '../../../../hooks/useQueryError';

// gets users access tokens
const getScimToken = async () =>
    lightdashApi<ScimOrganizationAccessToken[]>({
        url: `/scim/organization-access-tokens`,
        method: 'GET',
        body: undefined,
    });

const createScimToken = async (data: ApiCreateScimTokenRequest) =>
    lightdashApi<ApiCreateScimTokenResponse>({
        url: `/scim/organization-access-tokens`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteScimToken = async (tokenUuid: string) =>
    lightdashApi<null>({
        url: `/scim/organization-access-tokens/${tokenUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useScimTokenList = (
    useQueryOptions?: UseQueryOptions<ScimOrganizationAccessToken[], ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<ScimOrganizationAccessToken[], ApiError>({
        queryKey: ['scim_access_tokens'],
        queryFn: () => getScimToken(),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useCreateScimToken = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiCreateScimTokenResponse,
        ApiError,
        ApiCreateScimTokenRequest
    >((data) => createScimToken(data), {
        mutationKey: ['create_scim_access_token'],
        retry: 3,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['scim_access_tokens']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to create token`,
                apiError: error,
            });
        },
    });
};

export const useDeleteScimToken = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteScimToken, {
        mutationKey: ['delete_scim_access_token'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['scim_access_tokens']);
            showToastSuccess({
                title: `Success! Your token was deleted.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete token`,
                apiError: error,
            });
        },
    });
};
