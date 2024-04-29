import {
    ProjectType,
    type ApiError,
    type OrganizationProject,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useOrganization } from './organization/useOrganization';
import useToaster from './toaster/useToaster';

const getProjectsQuery = async () =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
        body: undefined,
    });

export const useProjects = (
    useQueryOptions?: UseQueryOptions<OrganizationProject[], ApiError>,
) => {
    return useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: getProjectsQuery,
        ...useQueryOptions,
    });
};

export const useDefaultProject = (useQueryOptions?: {
    refetchOnMount: boolean;
}): {
    isLoading: boolean;
    data: OrganizationProject | undefined;
} => {
    const { isInitialLoading: isOrganizationLoading, data: org } =
        useOrganization(useQueryOptions);
    const { isInitialLoading: isLoadingProjects, data: projects = [] } =
        useProjects(useQueryOptions);

    const defaultProject = projects?.find(
        (project) => project.projectUuid === org?.defaultProjectUuid,
    );

    const fallbackProject = projects?.find(
        ({ type }) => type === ProjectType.DEFAULT,
    );

    return {
        isLoading: isOrganizationLoading || isLoadingProjects,
        data: defaultProject || fallbackProject || projects?.[0],
    };
};

const deleteProjectQuery = async (id: string) =>
    lightdashApi<null>({
        url: `/org/projects/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteProjectMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteProjectQuery, {
        mutationKey: ['organization_project_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['projects']);
            showToastSuccess({
                title: `Deleted! Project was deleted.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete project`,
                apiError: error,
            });
        },
    });
};
