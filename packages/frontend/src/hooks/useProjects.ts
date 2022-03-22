import { ApiError, OrganizationProject } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getProjectsQuery = async () =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
        body: undefined,
    });

export const useProjects = () => {
    return useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: getProjectsQuery,
        retry: false,
    });
};

export const useDefaultProject = () => {
    const projectsQuery = useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects', 'defaultProject'],
        queryFn: getProjectsQuery,
        retry: false,
    });
    return { ...projectsQuery, data: projectsQuery.data?.[0] };
};
