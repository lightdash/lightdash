import { subject } from '@casl/ability';
import {
    FeatureFlags,
    type AddSharedDbtSource,
    type ApiError,
    type DbtRepositorySummary,
    type PeerDbtSourceSummary,
    type UpdatePeerDbtSource,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useApp from '../providers/App/useApp';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

const sourcesUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/dbt-sources`;

const usePeerDbtSources = (projectUuid: string, enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<PeerDbtSourceSummary[], ApiError>({
        queryKey: ['project_dbt_sources', projectUuid, 'peers'],
        queryFn: () =>
            lightdashApi<PeerDbtSourceSummary[]>({
                url: `${sourcesUrl(projectUuid)}/peers`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });
};

export const useSharedDbtSources = (projectUuid: string, enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<DbtRepositorySummary[], ApiError>({
        queryKey: ['shared_dbt_sources', projectUuid],
        queryFn: () =>
            lightdashApi<DbtRepositorySummary[]>({
                url: `${sourcesUrl(projectUuid)}/shared`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });
};

const useInvalidatePeerDbtSources = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return () =>
        Promise.all([
            queryClient.invalidateQueries(['project_dbt_sources', projectUuid]),
            queryClient.invalidateQueries(['shared_dbt_sources']),
            queryClient.invalidateQueries([
                'projects',
                projectUuid,
                'dbt-source-bindings',
            ]),
        ]);
};

export const useUpdatePeerDbtSource = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const invalidate = useInvalidatePeerDbtSources(projectUuid);
    return useMutation<
        undefined,
        ApiError,
        { sourceUuid: string; data: UpdatePeerDbtSource }
    >(
        ({ sourceUuid, data }) =>
            lightdashApi<undefined>({
                url: `${sourcesUrl(projectUuid)}/peers/${sourceUuid}`,
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        { onSuccess: invalidate },
    );
};

export const useAddSharedDbtSource = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const invalidate = useInvalidatePeerDbtSources(projectUuid);
    return useMutation<string, ApiError, AddSharedDbtSource>(
        (data) =>
            lightdashApi<string>({
                url: `${sourcesUrl(projectUuid)}/shared`,
                method: 'POST',
                body: JSON.stringify(data),
            }),
        { onSuccess: invalidate },
    );
};

export const useShareDbtRepository = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        undefined,
        ApiError,
        { repositoryUuid: string; isShared: boolean }
    >(
        ({ repositoryUuid, isShared }) =>
            lightdashApi<undefined>({
                url: `${sourcesUrl(projectUuid)}/repositories/${repositoryUuid}`,
                method: 'PATCH',
                body: JSON.stringify({ isShared }),
            }),
        {
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries(['project_dbt_sources']),
                    queryClient.invalidateQueries(['shared_dbt_sources']),
                ]);
            },
        },
    );
};

export const usePeerDbtSourceAccess = (
    projectUuid: string,
    panelEnabled: boolean,
) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.PeerDbtSources);
    const enabled = flag?.enabled === true;
    const { data: sources, isError } = usePeerDbtSources(
        projectUuid,
        enabled && panelEnabled,
    );
    const { user } = useApp();
    const canManage =
        !enabled ||
        user.data?.ability.can(
            'manage',
            subject('Project', {
                projectUuid,
                organizationUuid: user.data.organizationUuid,
            }),
        ) === true;
    const peersByUuid = new Map(
        (enabled ? (sources ?? []) : []).map((source) => [
            source.projectDbtSourceUuid,
            source,
        ]),
    );
    return { enabled, canManage, peersByUuid, isError };
};
