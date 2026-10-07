import {
    FeatureFlags,
    type AiAccessForUser,
    type AiMarkerTestResult,
    type AiAccessPolicy,
    type AiPrincipal,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type ApiError,
    type ApiResponse,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';

const aiAccessUrl = (
    projectUuid: string,
    path: string,
    connection: string | null,
    params: Record<string, string> = {},
) => {
    const query = new URLSearchParams(params);
    if (connection !== null) query.set('connection', connection);
    return `/projects/${encodeURIComponent(projectUuid)}/ai-access/${path}${query.size ? `?${query}` : ''}`;
};
const get = <T extends ApiResponse['results']>(
    projectUuid: string,
    path: string,
    connection: string | null,
    params?: Record<string, string>,
) =>
    lightdashApi<T>({
        version: 'v2',
        url: aiAccessUrl(projectUuid, path, connection, params),
        sensitive: path === 'setup-script',
        method: 'GET',
        body: undefined,
    });
export const aiAccessApi = {
    capabilities: (project: string, connection: string | null) =>
        get<AiWarehouseCapabilities>(project, 'capabilities', connection),
    policy: (project: string, connection: string | null) =>
        get<AiAccessPolicy | null>(project, 'policy', connection),
    principals: (project: string, connection: string | null) =>
        get<AiPrincipal[]>(project, 'principals', connection),
    setupScript: (
        project: string,
        connection: string | null,
        principal: string | null,
    ) =>
        get<AiSetupScript>(
            project,
            'setup-script',
            connection,
            principal ? { principal } : {},
        ),
    me: (project: string, connection: string | null) =>
        get<AiAccessForUser>(project, 'me', connection),
    upsertPolicy: (
        project: string,
        connection: string | null,
        policy: UpsertAiAccessPolicy,
    ) =>
        lightdashApi<AiAccessPolicy>({
            version: 'v2',
            url: aiAccessUrl(project, 'policy', connection),
            method: 'PUT',
            body: JSON.stringify(policy),
        }),
    test: (project: string, connection: string | null, uuid: string) =>
        lightdashApi<AiPrincipal>({
            version: 'v2',
            url: aiAccessUrl(
                project,
                `principals/${encodeURIComponent(uuid)}/test`,
                connection,
            ),
            method: 'POST',
            body: undefined,
        }),
    regenerateSecret: (
        project: string,
        connection: string | null,
        uuid: string,
    ) =>
        lightdashApi<AiPrincipal>({
            version: 'v2',
            url: aiAccessUrl(
                project,
                `principals/${encodeURIComponent(uuid)}/regenerate-secret`,
                connection,
            ),
            method: 'POST',
            body: undefined,
        }),
    deletePrincipal: (
        project: string,
        connection: string | null,
        uuid: string,
    ) =>
        lightdashApi<undefined>({
            version: 'v2',
            url: aiAccessUrl(
                project,
                `principals/${encodeURIComponent(uuid)}`,
                connection,
            ),
            method: 'DELETE',
            body: undefined,
        }),
};
const useAccessQuery = <T>(
    project: string,
    connection: string | null,
    path: string,
    queryFn: () => Promise<T>,
    enabled = true,
    extra: (string | number | null)[] = [],
    sensitive = false,
) => {
    const { showToastApiError } = useToaster();
    const t = useUiStrings();
    return useQuery<T, ApiError>({
        queryKey: ['ai-access', project, connection, path, ...extra],
        queryFn,
        enabled: !!project && enabled,
        cacheTime: sensitive ? 0 : undefined,
        refetchOnWindowFocus: true,
        onError: ({ error }) =>
            showToastApiError({
                title: t('aiAccess.loadError'),
                apiError: error,
            }),
    });
};
export const useAiAccessCapabilities = (
    project: string,
    connection: string | null,
) =>
    useAccessQuery(project, connection, 'capabilities', () =>
        aiAccessApi.capabilities(project, connection),
    );
export const useAiAccessPolicy = (project: string, connection: string | null) =>
    useAccessQuery(project, connection, 'policy', () =>
        aiAccessApi.policy(project, connection),
    );
export const useMyAiAccess = (
    project: string | undefined,
    connection: string | null = null,
) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AiPrincipals);
    return useAccessQuery(
        project ?? '',
        connection,
        'me',
        () => aiAccessApi.me(project!, connection),
        flag?.enabled === true,
    );
};
const useAccessMutation = <T, V>(
    project: string,
    mutationFn: (value: V) => Promise<T>,
) => {
    const client = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<T, ApiError, V>({
        mutationFn,
        onSuccess: () => client.invalidateQueries(['ai-access', project]),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not update AI access',
                apiError: error,
            }),
    });
};
export const useUpsertAiAccessPolicy = (
    project: string,
    connection: string | null,
) =>
    useAccessMutation(project, (policy: UpsertAiAccessPolicy) =>
        aiAccessApi.upsertPolicy(project, connection, policy),
    );
export const useTestAiMarker = (project: string, connection: string | null) =>
    useAccessMutation(project, () =>
        lightdashApi<AiMarkerTestResult>({
            version: 'v2',
            url: aiAccessUrl(project, 'marker/test', connection),
            method: 'POST',
            body: undefined,
        }),
    );
