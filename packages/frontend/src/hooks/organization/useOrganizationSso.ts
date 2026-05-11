import {
    type ApiError,
    type AzureAdSsoConfigSummary,
    type UpsertAzureAdSsoConfig,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_sso', 'azuread'];

const getAzureAdSsoConfig = async () =>
    lightdashApi<AzureAdSsoConfigSummary | null>({
        url: '/org/sso/azuread',
        method: 'GET',
        body: undefined,
    });

const upsertAzureAdSsoConfig = async (data: UpsertAzureAdSsoConfig) =>
    lightdashApi<AzureAdSsoConfigSummary>({
        url: '/org/sso/azuread',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteAzureAdSsoConfig = async () =>
    lightdashApi<undefined>({
        url: '/org/sso/azuread',
        method: 'DELETE',
        body: undefined,
    });

export const useAzureAdSsoConfig = () =>
    useQuery<AzureAdSsoConfigSummary | null, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getAzureAdSsoConfig,
    });

export const useUpsertAzureAdSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AzureAdSsoConfigSummary,
        ApiError,
        UpsertAzureAdSsoConfig
    >(upsertAzureAdSsoConfig, {
        mutationKey: ['organization_sso', 'azuread', 'upsert'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(QUERY_KEY);
            showToastSuccess({
                title: 'Azure AD SSO settings saved',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save Azure AD SSO settings',
                apiError: error,
            });
        },
    });
};

export const useDeleteAzureAdSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(deleteAzureAdSsoConfig, {
        mutationKey: ['organization_sso', 'azuread', 'delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(QUERY_KEY);
            showToastSuccess({
                title: 'Azure AD SSO settings removed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove Azure AD SSO settings',
                apiError: error,
            });
        },
    });
};
