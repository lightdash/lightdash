import {
    type ApiError,
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
    uuid: string | undefined;
    onSuccess?: (data: SqlChart) => void;
};

const fetchSavedSqlChart = async ({
    projectUuid,
    uuid,
}: GetSavedSqlChartParams) =>
    lightdashApi<SqlChart>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const createSavedSqlChart = async (projectUuid: string, data: CreateSqlChart) =>
    lightdashApi<{
        savedSqlUuid: string;
    }>({
        url: `/projects/${projectUuid}/sqlRunner/saved`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateSavedSqlChart = async (
    projectUuid: string,
    savedSqlUuid: string,
    data: UpdateSqlChart,
) =>
    lightdashApi<{
        savedSqlUuid: string;
    }>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSavedSqlChart = ({
    projectUuid,
    uuid,
    onSuccess,
}: GetSavedSqlChartParams) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, uuid],
        queryFn: () => fetchSavedSqlChart({ projectUuid, uuid }),
        retry: false,
        onSuccess: (data) => {
            if (onSuccess) onSuccess(data);
        },
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const history = useHistory();

    return useMutation<
        {
            savedSqlUuid: string;
        },
        ApiError,
        CreateSqlChart
    >((data) => createSavedSqlChart(projectUuid, data), {
        mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
        onSuccess: (data) => {
            history.replace(
                `/projects/${projectUuid}/sql-runner-new/saved/${data.savedSqlUuid}`,
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
    });
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
                    title: `Success! SQL chart update`,
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
