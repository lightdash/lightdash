import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiUpdateSqlChart,
    type CreateSqlChart,
    type SqlChart,
    type UpdateSqlChart,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    slug: string | undefined;
    onSuccess?: (data: SqlChart) => void;
};

const fetchSavedSqlChart = async ({
    projectUuid,
    slug,
}: GetSavedSqlChartParams) =>
    lightdashApi<SqlChart>({
        url: `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}`,
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
    onSuccess,
}: GetSavedSqlChartParams) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, slug],
        queryFn: () => fetchSavedSqlChart({ projectUuid, slug }),
        retry: false,
        enabled: !!slug,
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
                history.replace(
                    `/projects/${projectUuid}/sql-runner-new/saved/${data.slug}`,
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
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<{ savedSqlUuid: string }, ApiError, UpdateSqlChart>(
        (data) => updateSavedSqlChart(projectUuid, savedSqlUuid!, data),
        {
            mutationKey: ['sqlRunner', 'updateSqlChart', savedSqlUuid],
            onSuccess: () => {
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
