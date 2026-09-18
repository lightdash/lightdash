import {
    type ApiDataAppVizUpgradeImpactResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export const useDataAppVizUpgradeImpact = (
    projectUuid: string,
    dataAppVizUuid: string,
) =>
    useQuery<ApiDataAppVizUpgradeImpactResponse['results'], ApiError>({
        queryKey: ['data-app-viz-upgrade-impact', projectUuid, dataAppVizUuid],
        queryFn: () =>
            lightdashApi<ApiDataAppVizUpgradeImpactResponse['results']>({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}/upgrade-impact`,
            }),
        staleTime: 0,
        refetchOnMount: 'always',
        retry: false,
    });
