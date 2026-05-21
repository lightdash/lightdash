import { type ApiError, type OrganizationAccess } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getOrganizationAccess = async (): Promise<OrganizationAccess> => {
    return lightdashApi<OrganizationAccess>({
        url: '/org/access',
        method: 'GET',
        body: undefined,
    });
};

export const useOrganizationAccess = (enabled: boolean = true) =>
    useQuery<OrganizationAccess, ApiError>({
        queryKey: ['organization-access'],
        queryFn: getOrganizationAccess,
        enabled,
        retry: false,
        refetchOnMount: false,
    });
