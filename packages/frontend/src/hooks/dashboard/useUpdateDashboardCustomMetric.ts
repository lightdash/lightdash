import {
    type ApiError,
    type DashboardCustomMetricUpdateResult,
    type UpdateDashboardCustomMetric,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const updateDashboardCustomMetric = (
    dashboardUuid: string,
    payload: UpdateDashboardCustomMetric,
) =>
    lightdashApi<DashboardCustomMetricUpdateResult>({
        url: `/dashboards/${dashboardUuid}/custom-metrics`,
        method: 'PATCH',
        body: JSON.stringify(payload),
    });

export const useUpdateDashboardCustomMetric = (
    dashboardUuid: string | undefined,
) =>
    useMutation<
        DashboardCustomMetricUpdateResult,
        ApiError,
        UpdateDashboardCustomMetric
    >((payload) => {
        if (!dashboardUuid) {
            throw new Error('Missing dashboard uuid');
        }
        return updateDashboardCustomMetric(dashboardUuid, payload);
    });

type DeleteDashboardCustomMetricArgs = {
    metricTable: string;
    metricName: string;
    dryRun?: boolean;
};

const deleteDashboardCustomMetric = (
    dashboardUuid: string,
    { metricTable, metricName, dryRun }: DeleteDashboardCustomMetricArgs,
) =>
    lightdashApi<DashboardCustomMetricUpdateResult>({
        url: `/dashboards/${dashboardUuid}/custom-metrics/${encodeURIComponent(
            metricTable,
        )}/${encodeURIComponent(metricName)}?dryRun=${dryRun ? 'true' : 'false'}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteDashboardCustomMetric = (
    dashboardUuid: string | undefined,
) =>
    useMutation<
        DashboardCustomMetricUpdateResult,
        ApiError,
        DeleteDashboardCustomMetricArgs
    >((args) => {
        if (!dashboardUuid) {
            throw new Error('Missing dashboard uuid');
        }
        return deleteDashboardCustomMetric(dashboardUuid, args);
    });
