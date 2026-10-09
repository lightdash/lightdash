import {
    type ApiError,
    type AzureAdSsoConfigSummary,
    type GenericOidcSsoConfigSummary,
    type GoogleSsoConfigSummary,
    type OktaSsoConfigSummary,
    type OneLoginSsoConfigSummary,
    type UpsertAzureAdSsoConfig,
    type UpsertGenericOidcSsoConfig,
    type UpsertGoogleSsoConfig,
    type UpsertOktaSsoConfig,
    type UpsertOneLoginSsoConfig,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_sso', 'azuread'];

const getAzureAdSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<AzureAdSsoConfigSummary | null>({
        url: '/org/sso/azuread',
        method: 'GET',
        body: undefined,
    });

const upsertAzureAdSsoConfig = async (
    lightdashApi: LightdashApi,
    data: UpsertAzureAdSsoConfig,
) =>
    lightdashApi<AzureAdSsoConfigSummary>({
        url: '/org/sso/azuread',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteAzureAdSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/org/sso/azuread',
        method: 'DELETE',
        body: undefined,
    });

export const useAzureAdSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<AzureAdSsoConfigSummary | null, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: () => getAzureAdSsoConfig(lightdashApi),
    });
};

export const useUpsertAzureAdSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AzureAdSsoConfigSummary,
        ApiError,
        UpsertAzureAdSsoConfig
    >(
        (data: UpsertAzureAdSsoConfig) =>
            upsertAzureAdSsoConfig(lightdashApi, data),
        {
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
        },
    );
};

export const useDeleteAzureAdSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(
        () => deleteAzureAdSsoConfig(lightdashApi),
        {
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
        },
    );
};

const OKTA_QUERY_KEY = ['organization_sso', 'okta'];

const getOktaSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<OktaSsoConfigSummary | null>({
        url: '/org/sso/okta',
        method: 'GET',
        body: undefined,
    });

const upsertOktaSsoConfig = async (
    lightdashApi: LightdashApi,
    data: UpsertOktaSsoConfig,
) =>
    lightdashApi<OktaSsoConfigSummary>({
        url: '/org/sso/okta',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteOktaSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/org/sso/okta',
        method: 'DELETE',
        body: undefined,
    });

export const useOktaSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<OktaSsoConfigSummary | null, ApiError>({
        queryKey: OKTA_QUERY_KEY,
        queryFn: () => getOktaSsoConfig(lightdashApi),
    });
};

export const useUpsertOktaSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<OktaSsoConfigSummary, ApiError, UpsertOktaSsoConfig>(
        (data: UpsertOktaSsoConfig) => upsertOktaSsoConfig(lightdashApi, data),
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(
        () => deleteOktaSsoConfig(lightdashApi),
        {
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
        },
    );
};

const OIDC_QUERY_KEY = ['organization_sso', 'oidc'];

const getGenericOidcSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<GenericOidcSsoConfigSummary | null>({
        url: '/org/sso/oidc',
        method: 'GET',
        body: undefined,
    });

const upsertGenericOidcSsoConfig = async (
    lightdashApi: LightdashApi,
    data: UpsertGenericOidcSsoConfig,
) =>
    lightdashApi<GenericOidcSsoConfigSummary>({
        url: '/org/sso/oidc',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteGenericOidcSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/org/sso/oidc',
        method: 'DELETE',
        body: undefined,
    });

export const useGenericOidcSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<GenericOidcSsoConfigSummary | null, ApiError>({
        queryKey: OIDC_QUERY_KEY,
        queryFn: () => getGenericOidcSsoConfig(lightdashApi),
    });
};

export const useUpsertGenericOidcSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        GenericOidcSsoConfigSummary,
        ApiError,
        UpsertGenericOidcSsoConfig
    >(
        (data: UpsertGenericOidcSsoConfig) =>
            upsertGenericOidcSsoConfig(lightdashApi, data),
        {
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
        },
    );
};

export const useDeleteGenericOidcSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(
        () => deleteGenericOidcSsoConfig(lightdashApi),
        {
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
        },
    );
};

const ONELOGIN_QUERY_KEY = ['organization_sso', 'oneLogin'];

const getOneLoginSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<OneLoginSsoConfigSummary | null>({
        url: '/org/sso/oneLogin',
        method: 'GET',
        body: undefined,
    });

const upsertOneLoginSsoConfig = async (
    lightdashApi: LightdashApi,
    data: UpsertOneLoginSsoConfig,
) =>
    lightdashApi<OneLoginSsoConfigSummary>({
        url: '/org/sso/oneLogin',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteOneLoginSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/org/sso/oneLogin',
        method: 'DELETE',
        body: undefined,
    });

export const useOneLoginSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<OneLoginSsoConfigSummary | null, ApiError>({
        queryKey: ONELOGIN_QUERY_KEY,
        queryFn: () => getOneLoginSsoConfig(lightdashApi),
    });
};

export const useUpsertOneLoginSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OneLoginSsoConfigSummary,
        ApiError,
        UpsertOneLoginSsoConfig
    >(
        (data: UpsertOneLoginSsoConfig) =>
            upsertOneLoginSsoConfig(lightdashApi, data),
        {
            mutationKey: ['organization_sso', 'oneLogin', 'upsert'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(ONELOGIN_QUERY_KEY);
                showToastSuccess({ title: 'OneLogin SSO settings saved' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to save OneLogin SSO settings',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteOneLoginSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(
        () => deleteOneLoginSsoConfig(lightdashApi),
        {
            mutationKey: ['organization_sso', 'oneLogin', 'delete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(ONELOGIN_QUERY_KEY);
                showToastSuccess({ title: 'OneLogin SSO settings removed' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove OneLogin SSO settings',
                    apiError: error,
                });
            },
        },
    );
};

const GOOGLE_QUERY_KEY = ['organization_sso', 'google'];

const getGoogleSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<GoogleSsoConfigSummary | null>({
        url: '/org/sso/google',
        method: 'GET',
        body: undefined,
    });

const upsertGoogleSsoConfig = async (
    lightdashApi: LightdashApi,
    data: UpsertGoogleSsoConfig,
) =>
    lightdashApi<GoogleSsoConfigSummary>({
        url: '/org/sso/google',
        method: 'PUT',
        body: JSON.stringify(data),
    });

const deleteGoogleSsoConfig = async (lightdashApi: LightdashApi) =>
    lightdashApi<undefined>({
        url: '/org/sso/google',
        method: 'DELETE',
        body: undefined,
    });

export const useGoogleSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<GoogleSsoConfigSummary | null, ApiError>({
        queryKey: GOOGLE_QUERY_KEY,
        queryFn: () => getGoogleSsoConfig(lightdashApi),
    });
};

export const useUpsertGoogleSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<GoogleSsoConfigSummary, ApiError, UpsertGoogleSsoConfig>(
        (data: UpsertGoogleSsoConfig) =>
            upsertGoogleSsoConfig(lightdashApi, data),
        {
            mutationKey: ['organization_sso', 'google', 'upsert'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(GOOGLE_QUERY_KEY);
                showToastSuccess({
                    title: 'Google SSO settings saved',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to save Google SSO settings',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteGoogleSsoConfig = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError>(
        () => deleteGoogleSsoConfig(lightdashApi),
        {
            mutationKey: ['organization_sso', 'google', 'delete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(GOOGLE_QUERY_KEY);
                showToastSuccess({
                    title: 'Google SSO settings removed',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove Google SSO settings',
                    apiError: error,
                });
            },
        },
    );
};
