import {
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const getSqlChartSchedulers = async (
    projectUuid: string,
    savedSqlUuid: string,
) =>
    lightdashApi<SchedulerAndTargets[]>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/schedulers`,
        method: 'GET',
        body: undefined,
    });

export const useSqlChartSchedulers = (
    projectUuid: string,
    savedSqlUuid: string,
) =>
    useQuery<SchedulerAndTargets[], ApiError>({
        queryKey: ['sql_chart_schedulers', savedSqlUuid],
        queryFn: () => getSqlChartSchedulers(projectUuid, savedSqlUuid),
        enabled: !!savedSqlUuid && !!projectUuid,
    });

const createSqlChartScheduler = async (
    projectUuid: string,
    savedSqlUuid: string,
    data: CreateSchedulerAndTargetsWithoutIds,
) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/schedulers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useSqlChartSchedulerCreateMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) =>
            createSqlChartScheduler(projectUuid, resourceUuid, data),
        {
            mutationKey: ['create_sql_chart_scheduler'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries([
                    'sql_chart_schedulers',
                    variables.resourceUuid,
                ]);
                showToastSuccess({
                    title: `Success! Scheduled delivery was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create scheduled delivery`,
                    apiError: error,
                });
            },
        },
    );
};
