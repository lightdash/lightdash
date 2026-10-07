import {
    FeatureFlags,
    type AiAccessForUser,
    type AiWarehouseCapabilities,
    type ApiError,
    type ApiResponse,
    type OrganizationAgentIdentitySettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../../api';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    hasAgentIdentityHint,
    updateAgentIdentityHint,
} from './agentIdentityHint';

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
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const flagEnabled = flag?.enabled;
    useEffect(() => {
        updateAgentIdentityHint(organizationUuid, flagEnabled);
    }, [organizationUuid, flagEnabled]);
    const query = useAccessQuery(
        project ?? '',
        connection,
        'me',
        () => aiAccessApi.me(project!, connection),
        flag?.enabled === true,
    );
    return {
        ...query,
        data: flag?.enabled === true ? query.data : undefined,
        isError: !!project && flag?.enabled === true && query.isError,
        isFetching: !!project && flagEnabled === true && query.isFetching,
        isLoading:
            !!project &&
            (flagEnabled === true
                ? query.isLoading
                : flagEnabled === undefined &&
                  hasAgentIdentityHint(organizationUuid)),
    };
};
export const useOrganizationAgentIdentitySettings = () => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    return useQuery<OrganizationAgentIdentitySettings, ApiError>({
        queryKey: ['ai-access', 'org', 'agent-identity'],
        queryFn: () =>
            lightdashApi<OrganizationAgentIdentitySettings>({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'GET',
                body: undefined,
            }),
        enabled: flag?.enabled === true,
    });
};

export const useUpdateOrganizationAgentIdentitySettings = () => {
    const client = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        OrganizationAgentIdentitySettings,
        ApiError,
        OrganizationAgentIdentitySettings
    >({
        mutationFn: (settings) =>
            lightdashApi<OrganizationAgentIdentitySettings>({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'PUT',
                body: JSON.stringify(settings),
            }),
        onSuccess: () => client.invalidateQueries(['ai-access']),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not update agent identity settings.',
                apiError: error,
            }),
    });
};
