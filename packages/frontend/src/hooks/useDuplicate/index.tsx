import { useCallback } from 'react';
import { useDuplicateDashboardMutation } from '../dashboard/useDashboard';
import { useDuplicateMutation } from '../useSavedQuery';

export const useDuplicateChart = (itemId: string) => {
    const { mutate: duplicateChart, data: duplicatedChart } =
        useDuplicateMutation(itemId);

    const onDuplicateChart = useCallback(() => {
        duplicateChart(itemId);
    }, []);

    return { onDuplicateChart, duplicatedChart };
};

export const useDuplicateDashboard = (itemId: string) => {
    const { mutate: duplicateDashboard } =
        useDuplicateDashboardMutation(itemId);

    const onDuplicateDashboard = useCallback(() => {
        duplicateDashboard(itemId);
    }, []);

    return { onDuplicateDashboard };
};
