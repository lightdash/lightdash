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
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const aiProviderCredentialsQueryKey = ['ai-provider-credentials'] as const;

const listAiProviderCredentials = async (lightdashApi: LightdashApi) =>
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiProviderCredentialsResponse['results'], ApiError>({
        queryKey: aiProviderCredentialsQueryKey,
        queryFn: () => listAiProviderCredentials(lightdashApi),
        ...queryOptions,
    });
};

export const useCreateAiProviderCredential = () => {
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Credential added' });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to add credential',
                apiError: error,
            }),
    });
};

export const useUpdateAiProviderCredential = () => {
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Credential updated' });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update credential',
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
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Credential replaced' });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to replace credential',
                apiError: error,
            }),
    });
};

export const useDeleteAiProviderCredential = () => {
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Credential deleted' });
            await invalidateCredentialQueries(queryClient);
        },
        // The API refuses to delete a credential a project still uses, and its
        // message names how many — so surface it rather than a generic failure.
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to delete credential',
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
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Bedrock configuration converted' });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to convert the Bedrock configuration',
                apiError: error,
            }),
    });
};

export const useSetDefaultAiProviderCredential = () => {
    const lightdashApi = useLightdashApi();
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
            showToastSuccess({ title: 'Default credential updated' });
            await invalidateCredentialQueries(queryClient);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to set default credential',
                apiError: error,
            }),
    });
};
