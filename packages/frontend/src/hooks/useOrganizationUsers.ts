import { ApiError, OrganizationUser } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getOrganizationUsersQuery = async () =>
    lightdashApi<OrganizationUser[]>({
        url: `/org/users`,
        method: 'GET',
        body: undefined,
    });

export const useOrganizationUsers = () =>
    useQuery<OrganizationUser[], ApiError>({
        queryKey: ['organization_users'],
        queryFn: getOrganizationUsersQuery,
    });
