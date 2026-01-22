import { type ApiError, type CatalogOwner } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getMetricOwners = async ({
    projectUuid,
}: {
    projectUuid: string;
}): Promise<CatalogOwner[]> => {
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
    return useQuery<CatalogOwner[], ApiError>({
        queryKey: ['metric-owners', projectUuid],
        queryFn: () => getMetricOwners({ projectUuid: projectUuid! }),
        enabled: !!projectUuid,
    });
};
