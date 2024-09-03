import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiUpdateSqlChart,
    type CreateSqlChart,
    type SqlChart,
    type UpdateSqlChart,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    slug?: string;
    uuid?: string;
    onSuccess?: (data: SqlChart) => void;
};

const fetchSavedSqlChart = async ({
    projectUuid,
    slug,
    uuid,
}: GetSavedSqlChartParams) =>
    lightdashApi<SqlChart>({
        url: uuid
            ? `/projects/${projectUuid}/sqlRunner/saved/${uuid}`
            : `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}`,
        method: 'GET',
        body: undefined,
    });

const createSavedSqlChart = async (projectUuid: string, data: CreateSqlChart) =>
    lightdashApi<ApiCreateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateSavedSqlChart = async (
    projectUuid: string,
    savedSqlUuid: string,
    data: UpdateSqlChart,
) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSavedSqlChart = ({
    projectUuid,
    slug,
    uuid,
    onSuccess,
}: GetSavedSqlChartParams) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, slug, uuid],
        queryFn: () => fetchSavedSqlChart({ projectUuid, slug, uuid }),
        retry: false,
        enabled: !!slug || !!uuid,
        onSuccess: (data) => {
            if (onSuccess) onSuccess(data);
        },
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const history = useHistory();

    return useMutation<ApiCreateSqlChart['results'], ApiError, CreateSqlChart>(
        (data) => createSavedSqlChart(projectUuid, data),
        {
            mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
            onSuccess: (data) => {
                history.push(
                    `/projects/${projectUuid}/sql-runner/${data.slug}`,
                );

                showToastSuccess({
                    title: `Success! SQL chart created`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateSqlChartMutation = (
    projectUuid: string,
    savedSqlUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        { savedSqlUuid: string },
        ApiError,
        UpdateSqlChart & { savedSqlUuid?: string }
    >(
        (data) =>
            updateSavedSqlChart(
                projectUuid,
                data.savedSqlUuid || savedSqlUuid!,
                data,
            ),
        {
            mutationKey: ['sqlRunner', 'updateSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['sqlRunner']);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                showToastSuccess({
                    title: `Success! SQL chart updated`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update chart`,
                    apiError: error,
                });
            },
        },
    );
};

const deleteSavedSqlChart = async (projectUuid: string, savedSqlUuid: string) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteSqlChartMutation = (
    projectUuid: string,
    savedSqlUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<{ savedSqlUuid: string }, ApiError>(
        () => deleteSavedSqlChart(projectUuid, savedSqlUuid),
        {
            mutationKey: ['sqlRunner', 'deleteSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['sqlRunner']);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                showToastSuccess({
                    title: `Success! SQL chart deleted`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete chart`,
                    apiError: error,
                });
            },
        },
    );
};
