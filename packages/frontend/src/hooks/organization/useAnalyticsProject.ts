import {
    type AnalyticsProjectStatus,
    type EnsureAnalyticsProjectResult,
    type ApiError,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { useOrganization } from './useOrganization';

export const useAnalyticsProject = () => {
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

const useRefreshAnalyticsProject = () => {
    const queryClient = useQueryClient();
    return () =>
        Promise.all([
            queryClient.invalidateQueries(['analytics-project']),
            queryClient.invalidateQueries(['projects']),
            queryClient.invalidateQueries(['user']),
        ]);
};

export const useCreateAnalyticsProject = () => {
    const refresh = useRefreshAnalyticsProject();
    return useMutation<EnsureAnalyticsProjectResult, ApiError>(
        () =>
            lightdashApi<EnsureAnalyticsProjectResult>({
                url: '/org/analytics-project',
                method: 'POST',
                body: undefined,
            }),
        {
            retry: false,
            onSuccess: refresh,
        },
    );
};

export const useDeleteAnalyticsProject = () => {
    const refresh = useRefreshAnalyticsProject();
    return useMutation<undefined, ApiError, string>(
        (projectUuid) =>
            lightdashApi<undefined>({
                url: `/org/analytics-project/${projectUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        { retry: false, onSuccess: refresh },
    );
};

export const useInstallAnalyticsSampleContent = () => {
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
                ]),
        },
    );
};
