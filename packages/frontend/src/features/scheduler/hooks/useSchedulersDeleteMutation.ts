import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const deleteScheduler = async (lightdashApi: LightdashApi, uuid: string) =>
    lightdashApi<null>({
        url: `/schedulers/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useSchedulersDeleteMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (uuid: string) => deleteScheduler(lightdashApi, uuid),
        {
            mutationKey: ['delete_scheduler'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['chart_schedulers']);
                await queryClient.invalidateQueries(['dashboard_schedulers']);
                await queryClient.invalidateQueries(['sql_chart_schedulers']);
                await queryClient.invalidateQueries(['app_schedulers']);
                await queryClient.invalidateQueries(['paginatedSchedulers']);
                showToastSuccess({
                    title: `Success! Scheduled delivery was deleted`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete scheduled delivery`,
                    apiError: error,
                });
            },
        },
    );
};
