import {
    type ApiError,
    type ApiInstallRegistryChartTypeResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('chartTypes');
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
                        ? t('install.upgradedToast')
                        : t('install.installedToast'),
                subtitle:
                    result.upgradedChartCount > 0
                        ? t('install.chartsMoved', {
                              count: result.upgradedChartCount,
                          })
                        : undefined,
            });
        },
        onError: (apiError, { projectUuid, chartSlug }) => {
            captureChartTypeError('chartTypeInstall', apiError, {
                projectUuid,
                chartSlug,
            });
            showToastApiError({
                title: t('install.failed'),
                apiError: apiError.error,
            });
        },
    });
};

type UpgradeAllRegistryChartTypesParams = {
    projectUuid: string;
    charts: { slug: string; name: string }[];
    upgradeConsumingCharts: boolean;
};

type UpgradeAllRegistryChartTypesResult = {
    upgradedCount: number;
    upgradedChartCount: number;
    failed: { slug: string; name: string; error: ApiError }[];
};

// Sequential so one failure doesn't abort the rest, and so the server isn't
// asked to pull every artifact at once.
const upgradeAllRegistryChartTypes = async ({
    projectUuid,
    charts,
    upgradeConsumingCharts,
}: UpgradeAllRegistryChartTypesParams): Promise<UpgradeAllRegistryChartTypesResult> => {
    const result: UpgradeAllRegistryChartTypesResult = {
        upgradedCount: 0,
        upgradedChartCount: 0,
        failed: [],
    };
    for (const chart of charts) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const installed = await installRegistryChartType({
                projectUuid,
                chartSlug: chart.slug,
                upgradeConsumingCharts,
            });
            result.upgradedCount += 1;
            result.upgradedChartCount += installed.upgradedChartCount;
        } catch (error) {
            result.failed.push({ ...chart, error: error as ApiError });
        }
    }
    return result;
};

export const useUpgradeAllRegistryChartTypes = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('chartTypes');
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        UpgradeAllRegistryChartTypesResult,
        ApiError,
        UpgradeAllRegistryChartTypesParams
    >({
        mutationFn: upgradeAllRegistryChartTypes,
        onSuccess: (result, { projectUuid }) => {
            void queryClient.invalidateQueries({
                queryKey: ['registry-chart-types', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['data-app-vizs'],
            });
            void queryClient.invalidateQueries({
                queryKey: ['data-app-viz', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['data-app-viz-render-metadata', projectUuid],
            });
            result.failed.forEach(({ slug, error }) =>
                captureChartTypeError('chartTypeInstall', error, {
                    projectUuid,
                    chartSlug: slug,
                }),
            );
            if (result.upgradedCount > 0) {
                showToastSuccess({
                    title: t('install.typesUpgraded', {
                        count: result.upgradedCount,
                    }),
                    subtitle:
                        result.upgradedChartCount > 0
                            ? t('install.chartsMovedPlural', {
                                  count: result.upgradedChartCount,
                              })
                            : undefined,
                });
            }
            if (result.failed.length > 0) {
                showToastError({
                    title: t('install.upgradeFailed', {
                        count: result.failed.length,
                    }),
                    subtitle: result.failed.map(({ name }) => name).join(', '),
                });
            }
        },
    });
};
