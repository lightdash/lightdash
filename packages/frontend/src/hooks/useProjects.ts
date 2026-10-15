import { type ApiError, type OrganizationProject } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const getProjectsQuery = async () =>
    lightdashApi<OrganizationProject[]>({
        url: `/org/projects`,
        method: 'GET',
    });

export const useProjects = (
    useQueryOptions?: UseQueryOptions<OrganizationProject[], ApiError>,
) =>
    useQuery<OrganizationProject[], ApiError>({
        queryKey: ['projects'],
        queryFn: getProjectsQuery,
        ...useQueryOptions,
    });

const deleteProjectQuery = async (id: string) =>
    lightdashApi<null>({
        url: `/org/projects/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteProjectMutation = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteProjectQuery, {
        mutationKey: ['organization_project_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['projects']);
            showToastSuccess({
                title: t('useProjects.deletedProjectWasDeleted'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useProjects.failedToDeleteProject'),
                apiError: error,
            });
        },
    });
};
