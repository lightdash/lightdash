import {
    ApiError,
    CreateDbtCloudIntegration,
    DbtCloudIntegration,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const get = async (projectUuid: string) =>
    lightdashApi<DbtCloudIntegration>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'GET',
        body: undefined,
    });

export const useProjectDbtCloud = (projectUuid: string) => {
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloud hook under react-router path with projectUuid available',
        );
    }
    return useQuery<DbtCloudIntegration, ApiError>({
        queryKey: ['dbt-cloud', projectUuid],
        queryFn: () => get(projectUuid),
    });
};

const post = async (projectUuid: string, data: CreateDbtCloudIntegration) =>
    lightdashApi<DbtCloudIntegration>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const doDelete = async (projectUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/integrations/dbt-cloud/settings`,
        method: 'DELETE',
        body: undefined,
    });

export const useProjectDbtCloudDeleteMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    if (projectUuid === undefined) {
        throw new Error(
            'Must use useProjectDbtCloudDeleteMutation hook under react-router path with projectUuid available',
        );
    }
    return useMutation<undefined, ApiError, undefined>(
        () => doDelete(projectUuid),
        {
            mutationKey: ['updated-dbt-cloud', projectUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'dbt-cloud-metrics',
                    projectUuid,
                ]);
                showToastSuccess({
                    title: `Success! Integration to dbt cloud was updated.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update integration`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useProjectDbtCloudUpdateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
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
        mutationKey: ['update-dbt-cloud', projectUuid],
        onSuccess: async () => {
            await queryClient.invalidateQueries([
                'dbt-cloud-metrics',
                projectUuid,
            ]);
            showToastSuccess({
                title: `Success! Integration to dbt cloud was updated.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to update integration`,
                subtitle: error.error.message,
            });
        },
    });
};
