import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getDashboardDefinition = async (id: string) =>
    lightdashApi<string>({
        url: `/dashboards/${id}/definition`,
        method: 'GET',
        body: undefined,
    });

export const useDashboardDefinition = (dashboardUuid: string) => {
    const queryKey = [dashboardUuid];

    return useQuery<string, ApiError>({
        queryKey,
        queryFn: () => getDashboardDefinition(dashboardUuid),
        retry: false,
        refetchOnMount: false,
    });
};
