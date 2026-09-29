import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { captureChartTypeError } from '../../chartTypes/utils/captureChartTypeError';
import {
    appApiBase,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type DeleteAppParams = {
    projectUuid: string;
    appUuid: string;
    // Organization chart types delete through the organization routes.
    owner: ChartTypeOwner;
    // For surfaces that say "chart type" instead of "data app".
    successTitle?: string;
};

const deleteApp = async ({
    projectUuid,
    appUuid,
    owner,
}: DeleteAppParams): Promise<void> => {
    await lightdashApi<undefined>({
        method: 'DELETE',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}`,
    });
};

export const useDeleteApp = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<void, ApiError, DeleteAppParams>({
        mutationFn: deleteApp,
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
            if (variables.owner === 'organization') {
                void queryClient.invalidateQueries({
                    queryKey: ['organization-data-app-vizs'],
                });
                void queryClient.invalidateQueries({
                    queryKey: ['organization-chart-type', variables.appUuid],
                });
            }
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
