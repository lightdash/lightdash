import { useCallback } from 'react';
import {
    useDashboardQuery,
    useDuplicateDashboardMutation,
} from '../dashboard/useDashboard';
import { useDuplicateMutation, useSavedQuery } from '../useSavedQuery';

export const useDuplicateChart = (itemId: string) => {
    const { data: chartToDuplicate } = useSavedQuery({ id: itemId });

    const { mutate: duplicateChart, data: duplicatedChart } =
        useDuplicateMutation(itemId);

    const onDuplicateChart = useCallback(() => {
        if (chartToDuplicate) {
            const { projectUuid, uuid, updatedAt, ...chartDuplicate } =
                chartToDuplicate;
            duplicateChart(chartDuplicate);
        }
    }, [chartToDuplicate]);

    return { onDuplicateChart, duplicatedChart };
};

export const useDuplicateDashboard = (itemId: string) => {
    const { data: dashboardToDuplicate } = useDashboardQuery(itemId);

    const { mutate: duplicateDashboard } =
        useDuplicateDashboardMutation(itemId);

    const onDuplicateDashboard = useCallback(() => {
        if (dashboardToDuplicate) {
            const { projectUuid, uuid, updatedAt, ...DashboardDuplicate } =
                dashboardToDuplicate;
            duplicateDashboard(DashboardDuplicate);
        }
    }, [dashboardToDuplicate]);

    return { onDuplicateDashboard };
};
