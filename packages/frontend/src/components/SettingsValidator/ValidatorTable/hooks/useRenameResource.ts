import {
    getErrorMessage,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiRenameBody,
    type ApiRenameChartBody,
    type ApiRenameChartResponse,
    type ApiRenameDashboardBody,
    type ApiRenameDashboardResponse,
    type ApiRenameFieldsResponse,
    type ApiRenameResponse,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../../api';
import { pollJobStatus } from '../../../../features/scheduler/hooks/useScheduler';
import useToaster from '../../../../hooks/toaster/useToaster';

const getFieldsForChart = async ({
    projectUuid,
    chartUuid,
}: {
    projectUuid: string;
    chartUuid: string;
}) => {
    return lightdashApi<ApiRenameFieldsResponse['results']>({
        url: `/projects/${projectUuid}/rename/chart/${chartUuid}/fields`,
        method: 'GET',
        body: undefined,
    });
};

export const useFieldsForChart = (projectUuid?: string, chartUuid?: string) => {
    return useQuery<ApiRenameFieldsResponse['results'], ApiError>({
        queryKey: ['fields-for-chart', projectUuid, chartUuid],
        queryFn: () =>
            getFieldsForChart({
                projectUuid: projectUuid!,
                chartUuid: chartUuid!,
            }),
        enabled: !!projectUuid && !!chartUuid,
    });
};

const renameChart = async ({
    projectUuid,
    chartUuid,
    from,
    to,
    fixAll,
    type,
}: ApiRenameChartBody & { projectUuid: string; chartUuid: string }) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/rename/chart/${chartUuid}`,
        method: 'POST',
        body: JSON.stringify({
            from,
            to,
            chartUuid,
            fixAll,
            type,
        }),
    });
};

export const useRenameChart = () => {
    const { t } = useTranslation('projectSettings');
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();
    return useMutation<
        ApiRenameChartResponse['results'],
        ApiError,
        ApiRenameChartBody & {
            chartUuid: string;
            resourceUrl?: string;
            projectUuid: string;
        }
    >({
        mutationKey: ['rename-chart'],
        mutationFn: (data) => {
            return renameChart(data);
        },

        onSuccess: async (job, { fixAll, from, type, resourceUrl }) => {
            showToastSuccess({
                key: 'rename_chart_toast',
                title: t('validatorFix.toasts.renamedOnChart', {
                    context: type,
                    from,
                }),
                action: {
                    children: t('validatorFix.toasts.open'),
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(
                            resourceUrl,
                            '_blank',
                            'noopener,noreferrer',
                        );
                    },
                },
            });

            if (fixAll && job?.jobId) {
                showToastInfo({
                    key: 'rename_references_toast',
                    title: t('validatorFix.toasts.updatingInCharts', {
                        context: type,
                        from,
                    }),
                });
                pollJobStatus(job.jobId)
                    .then((status) => {
                        const totalCharts =
                            status?.results?.charts?.length || 0;
                        showToastSuccess({
                            key: 'rename_references_toast',
                            title: t('validatorFix.toasts.renamedOnCharts', {
                                context: type,
                                from,
                                chartCount: totalCharts,
                            }),
                        });
                    })
                    .catch((e) => {
                        console.error(e);
                        showToastError({
                            key: 'rename_references_toast',
                            title: t('validatorFix.toasts.renameOthersFailed', {
                                context: type,
                            }),
                            subtitle: getErrorMessage(e),
                        });
                    });
            }
        },
        onError: (error) => {
            console.error(error);
            showToastError({
                key: 'rename_chart_toast',
                title: t('validatorFix.toasts.renameChartFailed'),
                subtitle: error.error.message,
            });
        },
    });
};

const previewRename = async ({
    projectUuid,
    from,
    to,
    type,
    model,
}: ApiRenameBody & { projectUuid: string }) => {
    return lightdashApi<ApiRenameResponse['results']>({
        url: `/projects/${projectUuid}/rename/preview`,
        method: 'POST',
        body: JSON.stringify({ from, to, type, model }),
    });
};

export const usePreviewRename = () => {
    return useMutation<
        ApiRenameResponse['results'],
        ApiError,
        ApiRenameBody & { projectUuid: string }
    >({
        mutationKey: ['preview-rename'],
        mutationFn: previewRename,
    });
};

const getFieldsForDashboard = async ({
    projectUuid,
    dashboardUuid,
    table,
}: {
    projectUuid: string;
    dashboardUuid: string;
    table?: string;
}) => {
    const params = table ? `?table=${encodeURIComponent(table)}` : '';
    return lightdashApi<ApiRenameFieldsResponse['results']>({
        url: `/projects/${projectUuid}/rename/dashboard/${dashboardUuid}/fields${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useFieldsForDashboard = (
    projectUuid?: string,
    dashboardUuid?: string,
    table?: string,
) => {
    return useQuery<ApiRenameFieldsResponse['results'], ApiError>({
        queryKey: ['fields-for-dashboard', projectUuid, dashboardUuid, table],
        queryFn: () =>
            getFieldsForDashboard({
                projectUuid: projectUuid!,
                dashboardUuid: dashboardUuid!,
                table,
            }),
        enabled: !!projectUuid && !!dashboardUuid,
    });
};

const renameDashboard = async ({
    projectUuid,
    dashboardUuid,
    from,
    to,
    fixAll,
    type,
}: ApiRenameDashboardBody & {
    projectUuid: string;
    dashboardUuid: string;
}) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/rename/dashboard/${dashboardUuid}`,
        method: 'POST',
        body: JSON.stringify({
            from,
            to,
            fixAll,
            type,
        }),
    });
};

export const useRenameDashboard = () => {
    const { t } = useTranslation('projectSettings');
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();
    return useMutation<
        ApiRenameDashboardResponse['results'],
        ApiError,
        ApiRenameDashboardBody & {
            dashboardUuid: string;
            resourceUrl?: string;
            projectUuid: string;
        }
    >({
        mutationKey: ['rename-dashboard'],
        mutationFn: (data) => {
            return renameDashboard(data);
        },

        onSuccess: async (job, { fixAll, from, type, resourceUrl }) => {
            showToastSuccess({
                key: 'rename_dashboard_toast',
                title: t('validatorFix.toasts.renamedOnDashboard', {
                    context: type,
                    from,
                }),
                action: {
                    children: t('validatorFix.toasts.open'),
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(
                            resourceUrl,
                            '_blank',
                            'noopener,noreferrer',
                        );
                    },
                },
            });

            if (fixAll && job?.jobId) {
                showToastInfo({
                    key: 'rename_dashboard_references_toast',
                    title: t(
                        'validatorFix.toasts.updatingInChartsAndDashboards',
                        { context: type, from },
                    ),
                });
                pollJobStatus(job.jobId)
                    .then((status) => {
                        const totalCharts =
                            status?.results?.charts?.length || 0;
                        const totalDashboards =
                            status?.results?.dashboards?.length || 0;
                        showToastSuccess({
                            key: 'rename_dashboard_references_toast',
                            title: t(
                                'validatorFix.toasts.renamedOnChartsAndDashboards',
                                {
                                    context: type,
                                    from,
                                    chartCount: totalCharts,
                                    dashboardCount: totalDashboards,
                                },
                            ),
                        });
                    })
                    .catch((e) => {
                        console.error(e);
                        showToastError({
                            key: 'rename_dashboard_references_toast',
                            title: t('validatorFix.toasts.renameOthersFailed', {
                                context: type,
                            }),
                            subtitle: getErrorMessage(e),
                        });
                    });
            }
        },
        onError: (error) => {
            console.error(error);
            showToastError({
                key: 'rename_dashboard_toast',
                title: t('validatorFix.toasts.renameDashboardFilterFailed'),
                subtitle: error.error.message,
            });
        },
    });
};
