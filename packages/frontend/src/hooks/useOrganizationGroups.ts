import { ApiError, Group } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getOrganizationGroupsQuery = async () =>
    lightdashApi<Group[]>({
        url: `/org/groups`,
        method: 'GET',
        body: undefined,
    });

export const useOrganizationGroups = () => {
    const setErrorResponse = useQueryError();
    return useQuery<Group[], ApiError>({
        queryKey: ['organization_groups'],
        queryFn: getOrganizationGroupsQuery,
        onError: (result) => setErrorResponse(result),
    });
};
