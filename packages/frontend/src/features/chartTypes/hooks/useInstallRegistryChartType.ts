import {
    type ApiError,
    type ApiInstallRegistryChartTypeResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type InstallRegistryChartTypeParams = {
    projectUuid: string;
    chartSlug: string;
};

type InstallRegistryChartTypeResult =
    ApiInstallRegistryChartTypeResponse['results'];

const installRegistryChartType = ({
    projectUuid,
    chartSlug,
}: InstallRegistryChartTypeParams) =>
    lightdashApi<InstallRegistryChartTypeResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/registry/charts/${chartSlug}/install`,
        body: undefined,
    });

export const useInstallRegistryChartType = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        InstallRegistryChartTypeResult,
        ApiError,
        InstallRegistryChartTypeParams
    >({
        mutationFn: installRegistryChartType,
        onSuccess: (result, { projectUuid }) => {
            void queryClient.invalidateQueries({
                queryKey: ['registry-chart-types', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['data-app-vizs'],
            });
            showToastSuccess({
                title:
                    result.action === 'upgraded'
                        ? 'Chart type upgraded'
                        : 'Chart type installed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to install chart type',
                apiError: error,
            });
        },
    });
};
