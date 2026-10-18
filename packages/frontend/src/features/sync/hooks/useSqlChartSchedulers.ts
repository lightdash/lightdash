import {
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

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

export const useSqlChartSchedulerCreateMutation = (
    projectUuid: string | undefined,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >(
        ({ resourceUuid, data }) => {
            if (!projectUuid) {
                throw new Error('projectUuid is required');
            }
            return createSqlChartScheduler(projectUuid, resourceUuid, data);
        },
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
