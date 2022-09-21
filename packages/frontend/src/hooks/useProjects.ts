import { ApiError, OrganizationProject, ProjectType } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

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

const LAST_PROJECT_KEY = 'lastProject';

export const getLastProject = (): string | undefined => {
    return localStorage.getItem(LAST_PROJECT_KEY) || undefined;
};

export const setLastProject = (projectUuid: string) => {
    localStorage.setItem(LAST_PROJECT_KEY, projectUuid);
};

export const deleteLastProject = () => {
    localStorage.removeItem(LAST_PROJECT_KEY);
};

export const useDefaultProject = () => {
    const projectsQuery = useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects', 'defaultProject'],
        queryFn: getProjectsQuery,
        retry: false,
    });
    const defaultProject = projectsQuery.data?.find(
        ({ type }) => type === ProjectType.DEFAULT,
    );
    return {
        ...projectsQuery,
        data: defaultProject || projectsQuery.data?.[0],
    };
};

const deleteProjectQuery = async (id: string) =>
    lightdashApi<undefined>({
        url: `/org/projects/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteProjectMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteProjectQuery, {
        mutationKey: ['organization_project_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries('projects');
            showToastSuccess({
                title: `Deleted! Project was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete project`,
                subtitle: error.error.message,
            });
        },
    });
};
