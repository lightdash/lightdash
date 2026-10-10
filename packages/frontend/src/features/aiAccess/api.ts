import {
    FeatureFlags,
    type AgentCapabilityPolicy,
    type AgentCapabilityPolicyOverview,
    type AgentCapabilityCeiling,
    type AgentWarehouseConfirmationStatus,
    type AgentWarehouseRestrictionConfirmation,
    type ApiOrganizationAgentIdentityProjectsWithoutAiServiceAccountResponse,
    type WarehouseTypes,
    type ApiAiServiceAccountStatusResponse,
    type AiAccessForUser,
    type AiWarehouseCapabilities,
    type ApiError,
    type OrganizationAgentIdentitySnowflakeSetup,
    type UpdateOrganizationSnowflakeAgentClient,
    type OrganizationAgentIdentitySnowflakeVerify,
    type ApiResponse,
    type OrganizationAgentIdentityOverview,
    type OrganizationAgentIdentityRule,
    type AiServiceAccountCredentialInput,
    type ApiAiServiceAccountSaveResponse,
    type AiServiceAccountTestRequest,
    type AiServiceAccountTestResult,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId } from 'react';
import { lightdashApi, lightdashApiResponse } from '../../api';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';

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
    capabilities: (project: string, connection: string | null) =>
        get<AiWarehouseCapabilities>(project, 'capabilities', connection),
    me: (project: string, connection: string | null) =>
        get<AiAccessForUser>(project, 'me', connection),
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
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const flagEnabled = flag?.enabled;
    const query = useAccessQuery(
        project ?? '',
        connection,
        'me',
        () => aiAccessApi.me(project!, connection),
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

export const useProjectsWithoutAiServiceAccount = (
    warehouseType: WarehouseTypes,
    enabled: boolean,
) =>
    useQuery<
        ApiOrganizationAgentIdentityProjectsWithoutAiServiceAccountResponse['results'],
        ApiError
    >({
        queryKey: [
            'ai-access',
            'org',
            'agent-identity',
            warehouseType,
            'projects-without-ai-service-account',
        ],
        queryFn: () =>
            lightdashApi<
                ApiOrganizationAgentIdentityProjectsWithoutAiServiceAccountResponse['results']
            >({
                version: 'v2',
                url: `/org/agent-identity/${warehouseType}/projects-without-ai-service-account`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });

export const useUpdateOrganizationAgentIdentityRule = () => {
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
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useAccessQuery(
        projectUuid,
        null,
        'service-account',
        () =>
            lightdashApiResponse<ApiAiServiceAccountStatusResponse>({
                version: 'v2',
                url: aiAccessUrl(projectUuid, 'service-account', null),
                method: 'GET',
                body: undefined,
            }),
        flag?.enabled === true,
    );
};

const useSensitiveMutationScope = () => {
    const client = useQueryClient();
    const id = useId();
    const clear = useCallback(() => {
        const cache = client.getMutationCache();
        cache
            .findAll({ mutationKey: [id], exact: true })
            .forEach((mutation) => cache.remove(mutation));
    }, [client, id]);
    useEffect(() => clear, [clear]);
    return { mutationKey: [id], clear };
};

export interface AiServiceAccountSaveOutcome {
    slot: ApiAiServiceAccountSaveResponse['results'];
    verification: AiServiceAccountTestResult | null;
}

export const useSaveAiServiceAccount = (projectUuid: string) => {
    const client = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const sensitiveScope = useSensitiveMutationScope();
    const mutation = useMutation<
        AiServiceAccountSaveOutcome,
        ApiError,
        AiServiceAccountCredentialInput
    >({
        mutationKey: sensitiveScope.mutationKey,
        cacheTime: 0,
        mutationFn: async (credentials) => {
            const response =
                await lightdashApiResponse<ApiAiServiceAccountSaveResponse>({
                    version: 'v2',
                    url: aiAccessUrl(projectUuid, 'service-account', null),
                    method: 'PUT',
                    body: JSON.stringify(credentials),
                    sensitive: true,
                });
            return {
                slot: response.results,
                verification: response.verification ?? null,
            };
        },
        onSuccess: async () => {
            showToastSuccess({ title: 'Shared agent account saved.' });
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not save the shared agent account.',
                apiError: error,
            }),
    });
    return {
        ...mutation,
        reset: () => {
            mutation.reset();
            sensitiveScope.clear();
        },
    };
};

export const useDeleteAiServiceAccount = (projectUuid: string) => {
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
            showToastSuccess({ title: 'Shared agent account removed.' });
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not remove the shared agent account.',
                apiError: error,
            }),
    });
};

export const useTestAiServiceAccount = (projectUuid: string) => {
    const client = useQueryClient();
    const { showToastApiError } = useToaster();
    const sensitiveScope = useSensitiveMutationScope();
    const mutation = useMutation<
        AiServiceAccountTestResult,
        ApiError,
        AiServiceAccountTestRequest
    >({
        mutationKey: sensitiveScope.mutationKey,
        cacheTime: 0,
        mutationFn: (request) =>
            lightdashApi<AiServiceAccountTestResult>({
                version: 'v2',
                url: aiAccessUrl(projectUuid, 'service-account/test', null),
                method: 'POST',
                body: JSON.stringify(request),
                sensitive: true,
            }),
        onSuccess: async (_result, request) => {
            if (request.credentials === null)
                await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not test the shared agent account.',
                apiError: error,
            }),
    });
    return {
        ...mutation,
        reset: () => {
            mutation.reset();
            sensitiveScope.clear();
        },
    };
};

export const useSnowflakeAgentSetup = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useQuery<OrganizationAgentIdentitySnowflakeSetup, ApiError>({
        queryKey: [
            'ai-access',
            'org',
            user.data?.organizationUuid,
            'snowflake-setup',
        ],
        queryFn: () =>
            lightdashApi<OrganizationAgentIdentitySnowflakeSetup>({
                version: 'v2',
                url: '/org/agent-identity/snowflake/setup',
                method: 'GET',
                body: undefined,
            }),
        enabled: flag?.enabled === true,
        refetchOnWindowFocus: false,
        refetchOnMount: 'always',
    });
};

export const useSaveSnowflakeAgentClient = () => {
    const client = useQueryClient();
    const { user } = useApp();
    const { showToastSuccess } = useToaster();
    return useMutation<
        OrganizationAgentIdentitySnowflakeSetup,
        ApiError,
        UpdateOrganizationSnowflakeAgentClient
    >({
        mutationFn: (credentials) =>
            lightdashApi<OrganizationAgentIdentitySnowflakeSetup>({
                version: 'v2',
                url: '/org/agent-identity/snowflake/client',
                method: 'PUT',
                body: JSON.stringify(credentials),
                sensitive: true,
            }),
        cacheTime: 0,
        onSuccess: async (setup) => {
            const orgKey = ['ai-access', 'org', user.data?.organizationUuid];
            await Promise.all([
                client.cancelQueries([...orgKey, 'snowflake-verify']),
                client.cancelQueries([...orgKey, 'snowflake-setup']),
            ]);
            client.setQueryData([...orgKey, 'snowflake-setup'], setup);
            showToastSuccess({ title: 'Snowflake client saved.' });
            void Promise.all([
                client.resetQueries([...orgKey, 'snowflake-verify']),
                client.invalidateQueries(['ai-access']),
                client.invalidateQueries(['user_warehouse_credentials']),
            ]);
        },
    });
};

export const useSnowflakeAgentVerify = (enabled: boolean) => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const sessionId = useId();
    return useQuery<OrganizationAgentIdentitySnowflakeVerify, ApiError>({
        queryKey: [
            'ai-access',
            'org',
            user.data?.organizationUuid,
            'snowflake-verify',
            sessionId,
        ],
        queryFn: () =>
            lightdashApi<OrganizationAgentIdentitySnowflakeVerify>({
                version: 'v2',
                url: '/org/agent-identity/snowflake/verify',
                method: 'POST',
                body: undefined,
            }),
        enabled: enabled && flag?.enabled === true,
        cacheTime: 0,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });
};

const agentPolicyUrl = '/org/agent-permissions';
const warehouseConfirmationUrl = (projectUuid: string) =>
    `${agentPolicyUrl}/projects/${encodeURIComponent(projectUuid)}/warehouse-confirmation`;

export const useAgentCapabilityPolicy = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useQuery<AgentCapabilityPolicyOverview, ApiError>({
        queryKey: [
            'ai-access',
            'org',
            user.data?.organizationUuid,
            'agent-permissions',
        ],
        queryFn: () =>
            lightdashApi<AgentCapabilityPolicyOverview>({
                version: 'v2',
                url: agentPolicyUrl,
                method: 'GET',
                body: undefined,
            }),
        enabled: flag?.enabled === true,
    });
};

export const agentPolicyMutationKey = ['agent-permissions', 'policy-write'];

const useAgentPermissionMutation = <
    TResult extends ApiResponse['results'],
    TRequest,
>(
    url: string,
    method: 'PUT' | 'POST' | 'DELETE',
    errorTitle: string,
    onSaved?: (result: TResult) => void,
    mutationKey?: string[],
) => {
    const client = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<TResult, ApiError, TRequest>({
        mutationKey,
        mutationFn: (request) =>
            lightdashApi<TResult>({
                version: 'v2',
                url,
                method,
                body:
                    request === undefined ? undefined : JSON.stringify(request),
            }),
        onSuccess: async (result) => {
            onSaved?.(result);
            await client.invalidateQueries(['ai-access']);
        },
        onError: ({ error }) =>
            showToastApiError({ title: errorTitle, apiError: error }),
    });
};

export const useSaveAgentCapabilityCeiling = (
    onSaved: (policy: AgentCapabilityPolicy) => void,
) =>
    useAgentPermissionMutation<AgentCapabilityPolicy, AgentCapabilityCeiling>(
        agentPolicyUrl,
        'PUT',
        'Could not save agent permissions.',
        onSaved,
        agentPolicyMutationKey,
    );
export const useResetAgentCapabilityPolicy = (
    onSaved: (policy: AgentCapabilityPolicy) => void,
) =>
    useAgentPermissionMutation<
        AgentCapabilityPolicy,
        Pick<AgentCapabilityPolicy, 'version'>
    >(
        `${agentPolicyUrl}/reset`,
        'POST',
        'Could not turn off limits.',
        onSaved,
        agentPolicyMutationKey,
    );
export const useAgentWarehouseConfirmation = (projectUuid: string) =>
    useAccessQuery(projectUuid, null, 'warehouse-confirmation', () =>
        lightdashApi<AgentWarehouseConfirmationStatus>({
            version: 'v2',
            url: warehouseConfirmationUrl(projectUuid),
            method: 'GET',
            body: undefined,
        }),
    );
export const useConfirmAgentWarehouse = (projectUuid: string) =>
    useAgentPermissionMutation<AgentWarehouseRestrictionConfirmation, void>(
        warehouseConfirmationUrl(projectUuid),
        'PUT',
        'Could not confirm warehouse restrictions.',
    );
export const useDeleteAgentWarehouseConfirmation = (projectUuid: string) =>
    useAgentPermissionMutation<undefined, void>(
        warehouseConfirmationUrl(projectUuid),
        'DELETE',
        'Could not remove the warehouse confirmation.',
    );
