import {
    type ApiAiProviderCredentialCreatedResponse,
    type ApiAiProviderCredentialsResponse,
    type ApiError,
    type CreateAiProviderCredential,
    type UpdateAiProviderCredential,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

const aiProviderCredentialsQueryKey = ['ai-provider-credentials'] as const;

const listAiProviderCredentials = async () =>
    lightdashApi<ApiAiProviderCredentialsResponse['results']>({
        url: `/ai/provider-credentials`,
        method: 'GET',
        body: undefined,
    });

// Credentials gate which region a project resolves, so every write invalidates
// the per-project selections too.
const invalidateCredentialQueries = (queryClient: QueryClient) =>
    Promise.all([
        queryClient.invalidateQueries(aiProviderCredentialsQueryKey),
        queryClient.invalidateQueries(['project-ai-credential']),
    ]);

export const useAiProviderCredentials = (
    queryOptions?: UseQueryOptions<
        ApiAiProviderCredentialsResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiProviderCredentialsResponse['results'], ApiError>({
        queryKey: aiProviderCredentialsQueryKey,
        queryFn: listAiProviderCredentials,
        ...queryOptions,
    });

export const useCreateAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiProviderCredentialCreatedResponse['results'],
        ApiError,
        CreateAiProviderCredential
    >({
        mutationFn: (body) =>
            lightdashApi({
                url: `/ai/provider-credentials`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.added', { ns: 'aiAgent' }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.addFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

export const useUpdateAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        undefined,
        ApiError,
        { credentialUuid: string; data: UpdateAiProviderCredential }
    >({
        mutationFn: ({ credentialUuid, data }) =>
            lightdashApi({
                url: `/ai/provider-credentials/${credentialUuid}`,
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.updated', { ns: 'aiAgent' }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.updateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

/**
 * Full replacement. The only way to repair a credential whose ciphertext can no
 * longer be decrypted, since a partial update has to merge with the stored
 * config and cannot read it.
 */
export const useReplaceAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        undefined,
        ApiError,
        { credentialUuid: string; data: CreateAiProviderCredential }
    >({
        mutationFn: ({ credentialUuid, data }) =>
            lightdashApi({
                url: `/ai/provider-credentials/${credentialUuid}`,
                method: 'PUT',
                body: JSON.stringify(data),
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.replaced', { ns: 'aiAgent' }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.replaceFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

export const useDeleteAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<undefined, ApiError, string>({
        mutationFn: (credentialUuid) =>
            lightdashApi({
                url: `/ai/provider-credentials/${credentialUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.deleted', { ns: 'aiAgent' }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        // The API refuses to delete a credential a project still uses, and its
        // message names how many — so surface it rather than a generic failure.
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.deleteFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

/**
 * Converts a legacy single-blob Bedrock configuration into a managed
 * credential. An organization that configured Bedrock before named credentials
 * existed can otherwise see that configuration but never edit or remove it.
 */
export const useAdoptLegacyAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<undefined, ApiError, void>({
        mutationFn: () =>
            lightdashApi({
                url: `/ai/provider-credentials/adopt-legacy`,
                method: 'POST',
                body: undefined,
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.bedrockConverted', {
                    ns: 'aiAgent',
                }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.bedrockConvertFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

export const useSetDefaultAiProviderCredential = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<undefined, ApiError, string>({
        mutationFn: (credentialUuid) =>
            lightdashApi({
                url: `/ai/provider-credentials/${credentialUuid}/default`,
                method: 'PUT',
                body: undefined,
            }),
        onSuccess: async () => {
            showToastSuccess({
                title: i18n.t('toasts.credentials.defaultUpdated', {
                    ns: 'aiAgent',
                }),
            });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.credentials.defaultUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};
