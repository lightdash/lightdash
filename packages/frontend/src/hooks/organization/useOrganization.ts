import { type ApiError, type Organization } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getOrganization = async (lightdashApi: LightdashApi) =>
    lightdashApi<Organization>({
        url: `/org`,
        method: 'GET',
        body: undefined,
    });

export const useOrganization = (
    useQueryOptions?: UseQueryOptions<Organization, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Organization, ApiError>({
        queryKey: ['organization'],
        queryFn: () => getOrganization(lightdashApi),
        ...useQueryOptions,
    });
};
