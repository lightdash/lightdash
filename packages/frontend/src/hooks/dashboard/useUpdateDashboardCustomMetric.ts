import {
    type ApiError,
    type DashboardCustomMetricUpdateResult,
    type UpdateDashboardCustomMetric,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const updateDashboardCustomMetric = (
    lightdashApi: LightdashApi,
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
) => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        DashboardCustomMetricUpdateResult,
        ApiError,
        UpdateDashboardCustomMetric
    >((payload) => {
        if (!dashboardUuid) {
            throw new Error('Missing dashboard uuid');
        }
        return updateDashboardCustomMetric(
            lightdashApi,
            dashboardUuid,
            payload,
        );
    });
};

type DeleteDashboardCustomMetricArgs = {
    metricTable: string;
    metricName: string;
    dryRun?: boolean;
};

const deleteDashboardCustomMetric = (
    lightdashApi: LightdashApi,
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
) => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        DashboardCustomMetricUpdateResult,
        ApiError,
        DeleteDashboardCustomMetricArgs
    >((args) => {
        if (!dashboardUuid) {
            throw new Error('Missing dashboard uuid');
        }
        return deleteDashboardCustomMetric(lightdashApi, dashboardUuid, args);
    });
};
