import { type ApiError, type CatalogOwner } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getMetricOwners = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
    }: {
        projectUuid: string;
    },
): Promise<CatalogOwner[]> => {
    return lightdashApi<CatalogOwner[]>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/owners`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricOwners = ({
    projectUuid,
}: {
    projectUuid: string | undefined;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<CatalogOwner[], ApiError>({
        queryKey: ['metric-owners', projectUuid],
        queryFn: () =>
            getMetricOwners(lightdashApi, { projectUuid: projectUuid! }),
        enabled: !!projectUuid,
    });
};
