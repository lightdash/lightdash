import {
    type ApiDataAppVizDeleteImpactResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useDataAppVizDeleteImpact = (
    projectUuid: string,
    dataAppVizUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiDataAppVizDeleteImpactResponse['results'], ApiError>({
        queryKey: ['data-app-viz-delete-impact', projectUuid, dataAppVizUuid],
        queryFn: () =>
            lightdashApi<ApiDataAppVizDeleteImpactResponse['results']>({
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}/delete-impact`,
            }),
        staleTime: 0,
        refetchOnMount: 'always',
        retry: false,
    });
};
