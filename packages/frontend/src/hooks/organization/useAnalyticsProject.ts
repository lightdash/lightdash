import {
    type AnalyticsProjectStatus,
    type EnsureAnalyticsProjectResult,
    type ApiError,
    type AnalyticsHistoryBackfillStatus,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useOrganization } from './useOrganization';

export const useAnalyticsProject = () => {
    const lightdashApi = useLightdashApi();
    const { data: organization } = useOrganization();
    return useQuery<AnalyticsProjectStatus, ApiError>({
        queryKey: ['analytics-project', organization?.organizationUuid],
        queryFn: () =>
            lightdashApi<AnalyticsProjectStatus>({
                url: '/org/analytics-project',
                method: 'GET',
            }),
        enabled: !!organization?.organizationUuid,
        retry: false,
    });
};

export const useAnalyticsHistoryBackfill = (enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    const { data: organization } = useOrganization();
    return useQuery<AnalyticsHistoryBackfillStatus, ApiError>({
        queryKey: [
            'analytics-history-backfill',
            organization?.organizationUuid,
        ],
        queryFn: () =>
            lightdashApi<AnalyticsHistoryBackfillStatus>({
                url: '/org/analytics-project/backfill',
                method: 'GET',
            }),
        enabled: enabled && !!organization?.organizationUuid,
        retry: false,
        staleTime: 30_000,
        refetchInterval: (data) => (data?.running ? 2000 : false),
    });
};

export const useBackfillAnalyticsHistory = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>(
        () =>
            lightdashApi<undefined>({
                url: '/org/analytics-project/backfill',
                method: 'POST',
                body: undefined,
            }),
        {
            retry: false,
            onSuccess: () =>
                queryClient.invalidateQueries(['analytics-history-backfill']),
        },
    );
};

const useInvalidateAnalyticsProject = () => {
    const queryClient = useQueryClient();
    return () =>
        Promise.all([
            queryClient.invalidateQueries(['analytics-project']),
            queryClient.invalidateQueries(['projects']),
            queryClient.invalidateQueries(['user']),
        ]);
};

export const useCreateAnalyticsProject = () => {
    const lightdashApi = useLightdashApi();
    const invalidate = useInvalidateAnalyticsProject();
    return useMutation<EnsureAnalyticsProjectResult, ApiError>(
        () =>
            lightdashApi<EnsureAnalyticsProjectResult>({
                url: '/org/analytics-project',
                method: 'POST',
                body: undefined,
            }),
        {
            retry: false,
            onSuccess: invalidate,
        },
    );
};

export const useDeleteAnalyticsProject = () => {
    const lightdashApi = useLightdashApi();
    const invalidate = useInvalidateAnalyticsProject();
    return useMutation<undefined, ApiError, string>(
        (projectUuid) =>
            lightdashApi<undefined>({
                url: `/org/analytics-project/${projectUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        { retry: false, onSuccess: invalidate },
    );
};

export const useInstallAnalyticsSampleContent = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>(
        () =>
            lightdashApi<undefined>({
                url: '/org/analytics-project/sample-content',
                method: 'POST',
                body: undefined,
            }),
        {
            retry: false,
            onSuccess: () =>
                Promise.all([
                    queryClient.invalidateQueries(['analytics-project']),
                    queryClient.invalidateQueries(['dashboards']),
                    queryClient.invalidateQueries(['tables']),
                ]),
        },
    );
};
