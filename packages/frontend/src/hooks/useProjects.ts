import { type ApiError, type OrganizationProject } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const getProjectsQuery = async (lightdashApi: LightdashApi) =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
    });

export const useProjects = (
    useQueryOptions?: UseQueryOptions<OrganizationProject[], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: () => getProjectsQuery(lightdashApi),
        ...useQueryOptions,
    });
};

const deleteProjectQuery = async (lightdashApi: LightdashApi, id: string) =>
    lightdashApi<null>({
        url: `/org/projects/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteProjectMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (id: string) => deleteProjectQuery(lightdashApi, id),
        {
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
        },
    );
};
