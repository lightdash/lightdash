import { type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getMetricTables = async (
    lightdashApi: LightdashApi,
    { projectUuid }: { projectUuid: string },
): Promise<string[]> =>
    lightdashApi<string[]>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/tables`,
        method: 'GET',
        body: undefined,
    });

export const useMetricTables = ({
    projectUuid,
}: {
    projectUuid: string | undefined;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<string[], ApiError>({
        queryKey: ['metric-tables', projectUuid],
        queryFn: () =>
            getMetricTables(lightdashApi, { projectUuid: projectUuid! }),
        enabled: !!projectUuid,
    });
};
