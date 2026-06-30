import {
    type ApiCreateProjectDbtSource,
    type ApiError,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const getProjectDbtSources = async (projectUuid: string) =>
    lightdashApi<ProjectDbtSourceSummary[]>({
        url: `/projects/${projectUuid}/dbt-sources`,
        method: 'GET',
        body: undefined,
    });

const createProjectDbtSource = async (
    projectUuid: string,
    data: ApiCreateProjectDbtSource,
) =>
    lightdashApi<ProjectDbtSourceSummary>({
        url: `/projects/${projectUuid}/dbt-sources`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteProjectDbtSource = async (
    projectUuid: string,
    projectDbtSourceUuid: string,
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/dbt-sources/${projectDbtSourceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useProjectDbtSources = (projectUuid?: string) =>
    useQuery<ProjectDbtSourceSummary[], ApiError>({
        queryKey: ['project_dbt_sources', projectUuid],
        queryFn: () => getProjectDbtSources(projectUuid!),
        enabled: !!projectUuid,
    });

export const useCreateProjectDbtSourceMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ProjectDbtSourceSummary,
        ApiError,
        ApiCreateProjectDbtSource
    >((data) => createProjectDbtSource(projectUuid, data), {
        mutationKey: ['create_project_dbt_source', projectUuid],
        onSuccess: async () => {
            await queryClient.invalidateQueries([
                'project_dbt_sources',
                projectUuid,
            ]);
            showToastSuccess({ title: 'dbt source added' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to add dbt source',
                apiError: error,
            });
        },
    });
};

export const useDeleteProjectDbtSourceMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>(
        (projectDbtSourceUuid) =>
            deleteProjectDbtSource(projectUuid, projectDbtSourceUuid),
        {
            mutationKey: ['delete_project_dbt_source', projectUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project_dbt_sources',
                    projectUuid,
                ]);
                showToastSuccess({ title: 'dbt source removed' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to remove dbt source',
                    apiError: error,
                });
            },
        },
    );
};
