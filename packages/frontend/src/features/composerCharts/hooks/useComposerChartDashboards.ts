import { type ApiError, type ComposerChartDashboard } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** Dashboards whose latest version shows the chart, those the user can view only. */
export const useComposerChartDashboards = (
    projectUuid: string,
    composerChartUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartDashboard[], ApiError>({
        queryKey: ['composerChartDashboards', projectUuid, composerChartUuid],
        queryFn: () =>
            lightdashApi<ComposerChartDashboard[]>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuid}/dashboards`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        // The delete modal must name the dashboards as they are now
        refetchOnMount: 'always',
    });
};
