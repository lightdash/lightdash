import { useCallback } from 'react';
import { useMoveDashboard } from './dashboard/useDashboard';
import { useMoveMutation } from './useSavedQuery';

const useMoveToSpace = (
    isChart: boolean | undefined,
    data?: {
        uuid: string;
        name: string;
        spaceUuid?: string;
    },
) => {
    const { mutate: chartMutation } = useMoveMutation(data?.uuid);
    const { mutate: dashboardMutation } = useMoveDashboard(data?.uuid);

    const moveDashboard = useCallback(
        (updatedDashboard) => {
            if (!isChart && data?.name && updatedDashboard)
                dashboardMutation({
                    name: data.name,
                    spaceUuid: updatedDashboard.spaceUuid,
                });
        },
        [isChart, dashboardMutation, data?.name],
    );

    const moveChart = useCallback(
        (updatedChart) => {
            if (isChart && data?.name && updatedChart)
                chartMutation({
                    name: data.name,
                    spaceUuid: updatedChart.spaceUuid,
                });
        },
        [isChart, chartMutation, data?.name],
    );

    return {
        moveChart,
        moveDashboard,
    };
};

export default useMoveToSpace;
