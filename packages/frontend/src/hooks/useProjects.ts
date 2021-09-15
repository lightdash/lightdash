import { ApiError, OrganizationProject } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getProjectsQuery = async () =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
        body: undefined,
    });

export const useProjects = () =>
    useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: getProjectsQuery,
    });
