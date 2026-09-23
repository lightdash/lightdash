import {
    type ApiError,
    type ApiInstallRegistryChartTypeResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { captureChartTypeError } from '../utils/captureChartTypeError';

type InstallRegistryChartTypeParams = {
    projectUuid: string;
    chartSlug: string;
    /** Also move every pinned consuming saved chart onto the installed version. */
    upgradeConsumingCharts?: boolean;
};

type InstallRegistryChartTypeResult =
    ApiInstallRegistryChartTypeResponse['results'];

const installRegistryChartType = ({
    projectUuid,
    chartSlug,
    upgradeConsumingCharts,
}: InstallRegistryChartTypeParams) =>
    lightdashApi<InstallRegistryChartTypeResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/registry/charts/${chartSlug}/install`,
        body: JSON.stringify({
            upgradeConsumingCharts: upgradeConsumingCharts === true,
        }),
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
            void queryClient.invalidateQueries({
                queryKey: ['data-app-viz', projectUuid, result.appUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: [
                    'data-app-viz-render-metadata',
                    projectUuid,
                    result.appUuid,
                ],
            });
            showToastSuccess({
                title:
                    result.action === 'upgraded'
                        ? 'Chart type upgraded'
                        : 'Chart type installed',
                subtitle:
                    result.upgradedChartCount > 0
                        ? `${result.upgradedChartCount} saved chart${
                              result.upgradedChartCount === 1 ? '' : 's'
                          } moved to the new version`
                        : undefined,
            });
        },
        onError: (apiError, { projectUuid, chartSlug }) => {
            captureChartTypeError('chartTypeInstall', apiError, {
                projectUuid,
                chartSlug,
            });
            showToastApiError({
                title: 'Failed to install chart type',
                apiError: apiError.error,
            });
        },
    });
};
