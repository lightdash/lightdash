import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { captureChartTypeError } from '../../chartTypes/utils/captureChartTypeError';

type DeleteAppParams = {
    projectUuid: string;
    appUuid: string;
    // For surfaces that say "chart type" instead of "data app".
    successTitle?: string;
};

const deleteApp = async (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid }: DeleteAppParams,
): Promise<void> => {
    await lightdashApi<undefined>({
        method: 'DELETE',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}`,
    });
};

export const useDeleteApp = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<void, ApiError, DeleteAppParams>({
        mutationFn: (args: DeleteAppParams) => deleteApp(lightdashApi, args),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
            void queryClient.invalidateQueries({
                queryKey: ['registry-chart-types', variables.projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, variables.appUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    'data-app-viz',
                    variables.projectUuid,
                    variables.appUuid,
                ],
            });
            showToastSuccess({
                title: variables.successTitle ?? 'Data app deleted',
            });
        },
        onError: (apiError, variables) => {
            captureChartTypeError('dataAppDelete', apiError, {
                projectUuid: variables.projectUuid,
                appUuid: variables.appUuid,
            });
            showToastApiError({
                title: 'Failed to delete app',
                apiError: apiError.error,
            });
        },
    });
};
