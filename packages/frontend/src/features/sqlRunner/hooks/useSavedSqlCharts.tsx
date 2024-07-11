import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiSqlChart,
    type CreateSqlChart,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    uuid: string | undefined;
};

const fetchSavedSqlChart = async ({
    projectUuid,
    uuid,
}: GetSavedSqlChartParams) =>
    lightdashApi<ApiSqlChart>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const createSavedSqlChart = async (projectUuid: string, data: CreateSqlChart) =>
    lightdashApi<ApiSqlChart>({
        url: `/projects/${projectUuid}/sqlRunner/saved`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useSavedSqlChart = ({
    projectUuid,
    uuid,
}: GetSavedSqlChartParams) => {
    return useQuery<ApiSqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, uuid],
        queryFn: () =>
            fetchSavedSqlChart({
                projectUuid,
                uuid,
            }),
        retry: false,
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<ApiCreateSqlChart, ApiError, CreateSqlChart>(
        (data) => createSavedSqlChart(projectUuid, data),
        {
            mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
            onSuccess: (data) => {
                console.log('chart create data', data);

                showToastSuccess({
                    title: `Success! SQL chart created`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create project`,
                    apiError: error,
                });
            },
        },
    );
};
