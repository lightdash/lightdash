import { type ApiDashboardAsCodeListResponse } from '@lightdash/common';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { useContentAsCode } from './useContentAsCode';

const DASHBOARD_FIELDS_TO_OMIT = ['updatedAt', 'downloadedAt'];

const selectDashboard = (results: ApiDashboardAsCodeListResponse['results']) =>
    results.dashboards[0];

export const useDashboardAsCode = ({
    projectUuid,
    dashboardUuid,
    enabled,
}: {
    projectUuid: string;
    dashboardUuid: string;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    return useContentAsCode<ApiDashboardAsCodeListResponse['results']>({
        queryKey: ['dashboard-as-code', projectUuid, dashboardUuid],
        queryFn: () =>
            lightdashApi<ApiDashboardAsCodeListResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/dashboards?${new URLSearchParams(
                    [['ids', dashboardUuid]],
                ).toString()}`,
                body: undefined,
            }),
        selectDocument: selectDashboard,
        enabled,
        fieldsToOmit: DASHBOARD_FIELDS_TO_OMIT,
    });
};
