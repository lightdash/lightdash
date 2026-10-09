import { type ApiError, type OrganizationAccess } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getOrganizationAccess = async (
    lightdashApi: LightdashApi,
): Promise<OrganizationAccess> => {
    return lightdashApi<OrganizationAccess>({
        url: '/org/access',
        method: 'GET',
        body: undefined,
    });
};

export const useOrganizationAccess = (enabled: boolean = true) => {
    const lightdashApi = useLightdashApi();
    return useQuery<OrganizationAccess, ApiError>({
        queryKey: ['organization-access'],
        queryFn: () => getOrganizationAccess(lightdashApi),
        enabled,
        retry: false,
        refetchOnMount: false,
    });
};
