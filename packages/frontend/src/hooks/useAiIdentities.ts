import type {
    ApiAiIdentitiesResponse,
    ApiAiIdentityResponse,
    ApiAiIdentitySettingsResponse,
    ApiAiIdentitiesSqlResponse,
    ApiError,
    UpdateAiIdentity,
    UpdateAiIdentitySettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const identityKey = (projectUuid: string) => ['ai-identities', projectUuid];
const identityUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/ai-identities`;

export const useAiIdentities = (projectUuid: string, enabled: boolean) =>
    useQuery<ApiAiIdentitiesResponse['results'], ApiError>({
        queryKey: identityKey(projectUuid),
        queryFn: () =>
            lightdashApi<ApiAiIdentitiesResponse['results']>({
                url: identityUrl(projectUuid),
                method: 'GET',
                body: undefined,
                version: 'v2',
            }),
        enabled,
    });

export const useUpdateAiIdentitySettings = (projectUuid: string) => {
    const client = useQueryClient();
    return useMutation<
        ApiAiIdentitySettingsResponse['results'],
        ApiError,
        UpdateAiIdentitySettings
    >({
        mutationFn: (body) =>
            lightdashApi<ApiAiIdentitySettingsResponse['results']>({
                url: `${identityUrl(projectUuid)}/settings`,
                method: 'PATCH',
                body: JSON.stringify(body),
                version: 'v2',
            }),
        onSuccess: () => client.invalidateQueries(identityKey(projectUuid)),
    });
};

export const useProvisionAiIdentities = (projectUuid: string) => {
    const client = useQueryClient();
    return useMutation<ApiAiIdentitiesResponse['results'], ApiError, void>({
        mutationFn: () =>
            lightdashApi<ApiAiIdentitiesResponse['results']>({
                url: `${identityUrl(projectUuid)}/provision`,
                method: 'POST',
                body: undefined,
                version: 'v2',
            }),
        onSuccess: () => client.invalidateQueries(identityKey(projectUuid)),
    });
};

export const useUpdateAiIdentity = (projectUuid: string) => {
    const client = useQueryClient();
    return useMutation<
        ApiAiIdentityResponse['results'],
        ApiError,
        { userUuid: string; body: UpdateAiIdentity }
    >({
        mutationFn: ({ userUuid, body }) =>
            lightdashApi<ApiAiIdentityResponse['results']>({
                url: `${identityUrl(projectUuid)}/${userUuid}`,
                method: 'PATCH',
                body: JSON.stringify(body),
                version: 'v2',
            }),
        onSuccess: () => client.invalidateQueries(identityKey(projectUuid)),
    });
};

export const useTestAiIdentity = (projectUuid: string) => {
    const client = useQueryClient();
    return useMutation<ApiAiIdentityResponse['results'], ApiError, string>({
        mutationFn: (userUuid) =>
            lightdashApi<ApiAiIdentityResponse['results']>({
                url: `${identityUrl(projectUuid)}/${userUuid}/test`,
                method: 'POST',
                body: undefined,
                version: 'v2',
            }),
        onSuccess: () => client.invalidateQueries(identityKey(projectUuid)),
    });
};

export const useAiIdentitiesSql = (
    projectUuid: string,
    role: string,
    enabled: boolean,
) =>
    useQuery<ApiAiIdentitiesSqlResponse['results'], ApiError>({
        queryKey: [...identityKey(projectUuid), 'sql', role],
        queryFn: () =>
            lightdashApi<ApiAiIdentitiesSqlResponse['results']>({
                url: `${identityUrl(projectUuid)}/sql?role=${encodeURIComponent(role)}`,
                method: 'GET',
                body: undefined,
                version: 'v2',
            }),
        enabled: enabled && role.trim().length > 0,
    });
