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
