import { useCallback } from 'react';
import { useDuplicateMutation, useSavedQuery } from '../useSavedQuery';

const useDuplicate = (itemId: string) => {
    const isChart = true;

    const { data: chartToDuplicate } = useSavedQuery({ id: itemId });
    // const { data: dashboardToDuplicate } = useDashboardQuery(itemId);

    const { mutate: duplicateChart } = useDuplicateMutation(itemId);
    // const { mutate: duplicateDashboard } =
    //     useDuplicateDashboardMutation(itemId);

    const onDuplicateChart = useCallback(() => {
        if (chartToDuplicate) {
            const { projectUuid, uuid, updatedAt, ...chartDuplicate } =
                chartToDuplicate;
            duplicateChart(chartDuplicate);
        }
    }, [chartToDuplicate]);

    // const onDuplicateDashboard = useCallback(() => {
    //     if (dashboardToDuplicate) {
    //         const {
    //             projectUuid: idToForget,
    //             uuid,
    //             updatedAt,
    //             ...chartDuplicate
    //         } = duplicateDashboard;
    //         duplicateChart({
    //             ...duplicateDashboard,
    //             name: `${duplicateDashboard.name} (copy)`,
    //         });
    //     }
    // }, [dashboardToDuplicate]);

    return { onDuplicateChart };
};

export default useDuplicate;
