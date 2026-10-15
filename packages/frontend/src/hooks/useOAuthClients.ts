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
import { useTranslation } from 'react-i18next';
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

const updateOAuthClient = async (
    clientId: string,
    data: UpdateOAuthClientRequest,
) =>
    lightdashApi<OAuthClientSummary>({
        url: `/oauth/clients/${clientId}`,
        method: 'PATCH',
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
    const { t } = useTranslation('app');
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
                title: t('useOAuthClients.failedToCreateOauthApplication'),
                apiError: error,
            });
        },
    });
};

export const useUpdateOAuthClient = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        OAuthClientSummary,
        ApiError,
        { clientId: string; data: UpdateOAuthClientRequest }
    >(({ clientId, data }) => updateOAuthClient(clientId, data), {
        mutationKey: ['oauth_clients'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['oauth_clients']);
            showToastSuccess({
                title: t('useOAuthClients.oauthApplicationUpdated'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useOAuthClients.failedToUpdateOauthApplication'),
                apiError: error,
            });
        },
    });
};

export const useDeleteOAuthClient = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteOAuthClient, {
        mutationKey: ['oauth_clients'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['oauth_clients']);
            showToastSuccess({
                title: t('useOAuthClients.oauthApplicationDeleted'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useOAuthClients.failedToDeleteOauthApplication'),
                apiError: error,
            });
        },
    });
};
