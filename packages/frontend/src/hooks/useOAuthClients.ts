import {
    type ApiError,
    type CreateOAuthClientRequest,
    type CreateOAuthClientResponse,
    type OAuthClientSummary,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOAuthClients = async () =>
    lightdashApi<OAuthClientSummary[]>({
        url: `/oauth/clients`,
        method: 'GET',
        body: undefined,
    });

const createOAuthClient = async (data: CreateOAuthClientRequest) =>
    lightdashApi<CreateOAuthClientResponse>({
        url: `/oauth/clients`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteOAuthClient = async (clientId: string) =>
    lightdashApi<undefined>({
        url: `/oauth/clients/${clientId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOAuthClients = (
    useQueryOptions?: UseQueryOptions<OAuthClientSummary[], ApiError>,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<OAuthClientSummary[], ApiError>({
        queryKey: ['oauth_clients'],
        queryFn: () => getOAuthClients(),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useCreateOAuthClient = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        CreateOAuthClientResponse,
        ApiError,
        CreateOAuthClientRequest
    >((data) => createOAuthClient(data), {
        mutationKey: ['oauth_clients'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['oauth_clients']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to create OAuth application`,
                apiError: error,
            });
        },
    });
};

export const useDeleteOAuthClient = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteOAuthClient, {
        mutationKey: ['oauth_clients'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['oauth_clients']);
            showToastSuccess({
                title: `OAuth application deleted`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete OAuth application`,
                apiError: error,
            });
        },
    });
};
