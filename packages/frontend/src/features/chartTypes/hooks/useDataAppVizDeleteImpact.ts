import {
    assertUnreachable,
    type ApiDataAppVizDeleteImpactResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { appApiBase, type ChartTypeOwner } from '../utils/chartTypeOwner';

const deleteImpactRoute = (
    owner: ChartTypeOwner,
    projectUuid: string,
    dataAppVizUuid: string,
) => {
    switch (owner) {
        case 'organization':
            return {
                queryKey: [
                    'organization-chart-type-delete-impact',
                    dataAppVizUuid,
                ],
                url: `${appApiBase(owner, projectUuid)}/${dataAppVizUuid}/delete-impact`,
            };
        case 'project':
            return {
                queryKey: [
                    'data-app-viz-delete-impact',
                    projectUuid,
                    dataAppVizUuid,
                ],
                url: `${appApiBase(owner, projectUuid)}/visualizations/${dataAppVizUuid}/delete-impact`,
            };
        default:
            return assertUnreachable(owner, 'Unknown chart type owner');
    }
};

export const useDataAppVizDeleteImpact = (
    projectUuid: string,
    dataAppVizUuid: string,
    owner: ChartTypeOwner,
) => {
    const route = deleteImpactRoute(owner, projectUuid, dataAppVizUuid);
    return useQuery<ApiDataAppVizDeleteImpactResponse['results'], ApiError>({
        queryKey: route.queryKey,
        queryFn: () =>
            lightdashApi<ApiDataAppVizDeleteImpactResponse['results']>({
                method: 'GET',
                url: route.url,
            }),
        staleTime: 0,
        refetchOnMount: 'always',
        retry: false,
    });
};
