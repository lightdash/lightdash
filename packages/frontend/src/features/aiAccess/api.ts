import {
    FeatureFlags,
    type AiAccessForUser,
    type AiWarehouseCapabilities,
    type ApiError,
    type ApiResponse,
    type OrganizationAgentIdentityOverview,
    type OrganizationAgentIdentityRule,
    type AiServiceAccountCredentialInput,
    type AiServiceAccountSlot,
    type AiServiceAccountTestRequest,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const aiAccessUrl = (
    projectUuid: string,
    path: string,
    connection: string | null,
) => {
    const query = new URLSearchParams();
    if (connection !== null) query.set('connection', connection);
    return `/projects/${encodeURIComponent(projectUuid)}/ai-access/${path}${query.size ? `?${query}` : ''}`;
};
const get = <T extends ApiResponse['results']>(
    lightdashApi: LightdashApi,
    projectUuid: string,
    path: string,
    connection: string | null,
) =>
    lightdashApi<T>({
        version: 'v2',
        url: aiAccessUrl(projectUuid, path, connection),
        method: 'GET',
        body: undefined,
    });
export const aiAccessApi = {
    capabilities: (
        lightdashApi: LightdashApi,
        project: string,
        connection: string | null,
    ) =>
        get<AiWarehouseCapabilities>(
            lightdashApi,
            project,
            'capabilities',
            connection,
        ),
    me: (
        lightdashApi: LightdashApi,
        project: string,
        connection: string | null,
    ) => get<AiAccessForUser>(lightdashApi, project, 'me', connection),
};
const useAccessQuery = <T>(
    project: string,
    connection: string | null,
    path: string,
    queryFn: () => Promise<T>,
    enabled = true,
) => {
    const { showToastApiError } = useToaster();
    const t = useUiStrings();
    return useQuery<T, ApiError>({
        queryKey: ['ai-access', project, connection, path],
        queryFn,
        enabled: !!project && enabled,
        refetchOnWindowFocus: true,
        onError: ({ error }) =>
            showToastApiError({
                title: t('aiAccess.loadError'),
                apiError: error,
            }),
    });
};
export const useMyAiAccess = (
    project: string | undefined,
    connection: string | null = null,
) => {
    const lightdashApi = useLightdashApi();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const flagEnabled = flag?.enabled;
    const query = useAccessQuery(
        project ?? '',
        connection,
        'me',
        () => aiAccessApi.me(lightdashApi, project!, connection),
        flag?.enabled === true,
    );
    return {
        ...query,
        isAccessRequired: !!project && flagEnabled !== false,
        data: flag?.enabled === true ? query.data : undefined,
        isError: !!project && flag?.enabled === true && query.isError,
        isFetching: !!project && flagEnabled === true && query.isFetching,
        isLoading:
            !!project &&
            flagEnabled !== false &&
            (flagEnabled === undefined ||
                ((!query.data || query.isLoading) && !query.isError)),
    };
};
export const useOrganizationAgentIdentitySettings = () => {
    const lightdashApi = useLightdashApi();

    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useQuery<OrganizationAgentIdentityOverview, ApiError>({
        queryKey: ['ai-access', 'org', 'agent-identity'],
        queryFn: () =>
            lightdashApi<OrganizationAgentIdentityOverview>({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'GET',
                body: undefined,
            }),
        enabled: flag?.enabled === true,
    });
};

export const useUpdateOrganizationAgentIdentityRule = () => {
    const lightdashApi = useLightdashApi();

    const client = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationAgentIdentityRule,
        ApiError,
        Pick<OrganizationAgentIdentityRule, 'warehouseType' | 'source'>
    >({
        mutationFn: ({ warehouseType, ...rule }) =>
            lightdashApi<OrganizationAgentIdentityRule>({
                version: 'v2',
                url: `/org/agent-identity/${warehouseType}`,
                method: 'PUT',
                body: JSON.stringify(rule),
            }),
        onSuccess: async () => {
            showToastSuccess({ title: 'Agent identity saved.' });
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not update agent identity settings.',
                apiError: error,
            }),
    });
};

export const useAiServiceAccount = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();

    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useAccessQuery(
        projectUuid,
        null,
        'service-account',
        () =>
            get<AiServiceAccountSlot | null>(
                lightdashApi,
                projectUuid,
                'service-account',
                null,
            ),
        flag?.enabled === true,
    );
};

export const useSaveAiServiceAccount = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();

    const client = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiServiceAccountSlot | null,
        ApiError,
        AiServiceAccountCredentialInput
    >({
        mutationFn: (credentials) =>
            lightdashApi<AiServiceAccountSlot | null>({
                version: 'v2',
                url: aiAccessUrl(projectUuid, 'service-account', null),
                method: 'PUT',
                body: JSON.stringify(credentials),
                sensitive: true,
            }),
        onSuccess: async () => {
            showToastSuccess({ title: 'AI service account saved.' });
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not save the AI service account.',
                apiError: error,
            }),
    });
};

export const useDeleteAiServiceAccount = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();

    const client = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, void>({
        mutationFn: () =>
            lightdashApi<null>({
                version: 'v2',
                url: aiAccessUrl(projectUuid, 'service-account', null),
                method: 'DELETE',
                body: undefined,
            }),
        onSuccess: async () => {
            showToastSuccess({ title: 'AI service account removed.' });
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not remove the AI service account.',
                apiError: error,
            }),
    });
};

export const useTestAiServiceAccount = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();

    const { showToastApiError } = useToaster();
    return useMutation<
        AiServiceAccountTestResult,
        ApiError,
        AiServiceAccountTestRequest
    >({
        mutationFn: (request) =>
            lightdashApi<AiServiceAccountTestResult>({
                version: 'v2',
                url: aiAccessUrl(projectUuid, 'service-account/test', null),
                method: 'POST',
                body: JSON.stringify(request),
                sensitive: true,
            }),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not test the AI service account.',
                apiError: error,
            }),
    });
};
