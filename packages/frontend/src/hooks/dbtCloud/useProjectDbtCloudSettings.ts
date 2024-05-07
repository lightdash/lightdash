import {
    type ApiError,
    type CreateDbtCloudIntegration,
    type DbtCloudIntegration,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';

import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const get = async (projectUuid: string) =>
    lightdashApi<DbtCloudIntegration>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'GET',
        body: undefined,
    });

export const useProjectDbtCloud = (
    projectUuid: string,
    queryOptions: UseQueryOptions<DbtCloudIntegration, ApiError> = {},
) => {
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloud hook under react-router path with projectUuid available',
        );
    }
    return useQuery<DbtCloudIntegration, ApiError>(
        ['dbt-cloud', projectUuid],
        () => get(projectUuid),
        queryOptions,
    );
};

const post = async (projectUuid: string, data: CreateDbtCloudIntegration) =>
    lightdashApi<DbtCloudIntegration>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const deleteDbtProject = async (projectUuid: string) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'DELETE',
        body: undefined,
    });

export const useProjectDbtCloudDeleteMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloudDeleteMutation hook under react-router path with projectUuid available',
        );
    }
    return useMutation<null, ApiError, undefined>(
        () => deleteDbtProject(projectUuid),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['dbt-cloud', projectUuid]);

                showToastSuccess({
                    title: `Success! Integration to dbt Cloud was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete integration`,
                    apiError: error,
                });
            },
        },
    );
};

export const useProjectDbtCloudUpdateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloudUpdateMutation hook under react-router path with projectUuid available',
        );
    }
    return useMutation<
        DbtCloudIntegration,
        ApiError,
        CreateDbtCloudIntegration
    >((data: CreateDbtCloudIntegration) => post(projectUuid, data), {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['dbt-cloud', projectUuid]);
            showToastSuccess({
                title: `Success! Integration to dbt Cloud was updated.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to update integration`,
                apiError: error,
            });
        },
    });
};
