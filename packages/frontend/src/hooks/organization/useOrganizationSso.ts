import {
    type ApiError,
    type AzureAdSsoConfigSummary,
    type GenericOidcSsoConfigSummary,
    type OktaSsoConfigSummary,
    type UpsertAzureAdSsoConfig,
    type UpsertGenericOidcSsoConfig,
    type UpsertOktaSsoConfig,
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

const OKTA_QUERY_KEY = ['organization_sso', 'okta'];

const getOktaSsoConfig = async () =>
    lightdashApi<OktaSsoConfigSummary | null>({
        url: '/org/sso/okta',
        method: 'GET',
        body: undefined,
    });

const upsertOktaSsoConfig = async (data: UpsertOktaSsoConfig) =>
    lightdashApi<OktaSsoConfigSummary>({
        url: '/org/sso/okta',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteOktaSsoConfig = async () =>
    lightdashApi<undefined>({
        url: '/org/sso/okta',
        method: 'DELETE',
        body: undefined,
    });

export const useOktaSsoConfig = () =>
    useQuery<OktaSsoConfigSummary | null, ApiError>({
        queryKey: OKTA_QUERY_KEY,
        queryFn: getOktaSsoConfig,
    });

export const useUpsertOktaSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<OktaSsoConfigSummary, ApiError, UpsertOktaSsoConfig>(
        upsertOktaSsoConfig,
        {
            mutationKey: ['organization_sso', 'okta', 'upsert'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(OKTA_QUERY_KEY);
                showToastSuccess({
                    title: 'Okta SSO settings saved',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to save Okta SSO settings',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteOktaSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(deleteOktaSsoConfig, {
        mutationKey: ['organization_sso', 'okta', 'delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(OKTA_QUERY_KEY);
            showToastSuccess({
                title: 'Okta SSO settings removed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove Okta SSO settings',
                apiError: error,
            });
        },
    });
};

const OIDC_QUERY_KEY = ['organization_sso', 'oidc'];

const getGenericOidcSsoConfig = async () =>
    lightdashApi<GenericOidcSsoConfigSummary | null>({
        url: '/org/sso/oidc',
        method: 'GET',
        body: undefined,
    });

const upsertGenericOidcSsoConfig = async (data: UpsertGenericOidcSsoConfig) =>
    lightdashApi<GenericOidcSsoConfigSummary>({
        url: '/org/sso/oidc',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteGenericOidcSsoConfig = async () =>
    lightdashApi<undefined>({
        url: '/org/sso/oidc',
        method: 'DELETE',
        body: undefined,
    });

export const useGenericOidcSsoConfig = () =>
    useQuery<GenericOidcSsoConfigSummary | null, ApiError>({
        queryKey: OIDC_QUERY_KEY,
        queryFn: getGenericOidcSsoConfig,
    });

export const useUpsertGenericOidcSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        GenericOidcSsoConfigSummary,
        ApiError,
        UpsertGenericOidcSsoConfig
    >(upsertGenericOidcSsoConfig, {
        mutationKey: ['organization_sso', 'oidc', 'upsert'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(OIDC_QUERY_KEY);
            showToastSuccess({
                title: 'OIDC SSO settings saved',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save OIDC SSO settings',
                apiError: error,
            });
        },
    });
};

export const useDeleteGenericOidcSsoConfig = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(deleteGenericOidcSsoConfig, {
        mutationKey: ['organization_sso', 'oidc', 'delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(OIDC_QUERY_KEY);
            showToastSuccess({
                title: 'OIDC SSO settings removed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove OIDC SSO settings',
                apiError: error,
            });
        },
    });
};
