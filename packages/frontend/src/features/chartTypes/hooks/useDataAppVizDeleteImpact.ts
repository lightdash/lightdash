import {
    type ApiDataAppVizDeleteImpactResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    ORGANIZATION_CHART_TYPES_API_BASE,
    type ChartTypeOwner,
} from '../utils/chartTypeOwner';

export const useDataAppVizDeleteImpact = (
    projectUuid: string,
    dataAppVizUuid: string,
    owner: ChartTypeOwner = 'project',
) =>
    useQuery<ApiDataAppVizDeleteImpactResponse['results'], ApiError>({
        queryKey:
            owner === 'organization'
                ? ['organization-chart-type-delete-impact', dataAppVizUuid]
                : ['data-app-viz-delete-impact', projectUuid, dataAppVizUuid],
        queryFn: () =>
            lightdashApi<ApiDataAppVizDeleteImpactResponse['results']>({
                method: 'GET',
                url:
                    owner === 'organization'
                        ? `${ORGANIZATION_CHART_TYPES_API_BASE}/${dataAppVizUuid}/delete-impact`
                        : `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}/delete-impact`,
            }),
        staleTime: 0,
        refetchOnMount: 'always',
        retry: false,
    });
