import { useCallback } from 'react';
import {
    useDashboardQuery,
    useDuplicateDashboardMutation,
} from '../dashboard/useDashboard';
import { useDuplicateMutation, useSavedQuery } from '../useSavedQuery';

const useDuplicate = (itemId: string) => {
    // Chart data
    const { data: chartToDuplicate } = useSavedQuery({ id: itemId });
    const { mutate: duplicateChart, data: duplicatedChart } =
        useDuplicateMutation(itemId);

    // Dashboard data
    const { data: dashboardToDuplicate } = useDashboardQuery(itemId);
    const { mutate: duplicateDashboard } =
        useDuplicateDashboardMutation(itemId);

    const onDuplicate = useCallback(() => {
        // duplicate chart
        if (chartToDuplicate) {
            const { projectUuid, uuid, updatedAt, ...chartDuplicate } =
                chartToDuplicate;
            duplicateChart(chartDuplicate);
        }
        // duplicate dashboard
        if (dashboardToDuplicate) {
            const { projectUuid, uuid, updatedAt, ...DashboardDuplicate } =
                dashboardToDuplicate;
            duplicateDashboard(DashboardDuplicate);
        }
    }, [chartToDuplicate, dashboardToDuplicate]);

    return { onDuplicate, duplicatedChart };
};

export default useDuplicate;
