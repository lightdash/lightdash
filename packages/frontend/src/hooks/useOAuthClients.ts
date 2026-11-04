import {
    type ApiError,
    type CreateOAuthClientRequest,
    type CreateOAuthClientResponse,
    type OAuthClientSummary,
    type UpdateOAuthClientRequest,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getOAuthClients = async (lightdashApi: LightdashApi) =>
    lightdashApi<OAuthClientSummary[]>({
        url: `/oauth/clients`,
        method: 'GET',
        body: undefined,
    });

const createOAuthClient = async (
    lightdashApi: LightdashApi,
    data: CreateOAuthClientRequest,
) =>
    lightdashApi<CreateOAuthClientResponse>({
        url: `/oauth/clients`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateOAuthClient = async (
    lightdashApi: LightdashApi,
    clientId: string,
    data: UpdateOAuthClientRequest,
) =>
    lightdashApi<OAuthClientSummary>({
        url: `/oauth/clients/${clientId}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteOAuthClient = async (
    lightdashApi: LightdashApi,
    clientId: string,
) =>
    lightdashApi<undefined>({
        url: `/oauth/clients/${clientId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOAuthClients = (
    useQueryOptions?: UseQueryOptions<OAuthClientSummary[], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    return useQuery<OAuthClientSummary[], ApiError>({
        queryKey: ['oauth_clients'],
        queryFn: () => getOAuthClients(lightdashApi),
        retry: false,
        onError: (result) => setErrorResponse(result),
        ...useQueryOptions,
    });
};

export const useCreateOAuthClient = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        CreateOAuthClientResponse,
        ApiError,
        CreateOAuthClientRequest
    >((data) => createOAuthClient(lightdashApi, data), {
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

export const useUpdateOAuthClient = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        OAuthClientSummary,
        ApiError,
        { clientId: string; data: UpdateOAuthClientRequest }
    >(({ clientId, data }) => updateOAuthClient(lightdashApi, clientId, data), {
        mutationKey: ['oauth_clients'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['oauth_clients']);
            showToastSuccess({
                title: `OAuth application updated`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to update OAuth application`,
                apiError: error,
            });
        },
    });
};

export const useDeleteOAuthClient = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>(
        (clientId: string) => deleteOAuthClient(lightdashApi, clientId),
        {
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
        },
    );
};
