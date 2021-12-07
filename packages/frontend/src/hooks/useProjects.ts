import { ApiError, OrganizationProject } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getProjectsQuery = async () =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
        body: undefined,
    });

export const useProjects = () => {
    const setErrorResponse = useQueryError();
    return useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: getProjectsQuery,
        onError: (result) => setErrorResponse(result),
    });
};

export const useDefaultProject = () => {
    const projects = useProjects();
    return { ...projects, data: projects.data?.[0] };
};
