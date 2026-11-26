import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import {
    getDashboardChartPlace,
    hasLeftDashboardChart,
} from '../../hooks/dashboard/dashboardChartPlace';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useDashboardChartAction } from '../NavBar/useDashboardChartReturn';

/**
 * The sidebar lets the user leave a chart handed over by a dashboard mid-task,
 * so leaving drops the hand-over instead of letting it follow them around.
 */
export const useEndDashboardChartTaskOnLeave = () => {
    const { pathname } = useLocation();
    const { isEditingDashboardChart, clearDashboardStorage } =
        useDashboardStorage();
    const place = getDashboardChartPlace(pathname);
    const previousPlace = useRef(place);

    useEffect(() => {
        const previous = previousPlace.current;
        previousPlace.current = place;
        if (isEditingDashboardChart && hasLeftDashboardChart(previous, place)) {
            clearDashboardStorage();
        }
    }, [place, isEditingDashboardChart, clearDashboardStorage]);
};

/** Whether the chart on screen is being edited or created for a dashboard. */
export const useShowsDashboardChartNotice = (): boolean => {
    const { pathname } = useLocation();
    const { isEditingDashboardChart } = useDashboardStorage();
    const action = useDashboardChartAction();
    const place = getDashboardChartPlace(pathname);

    return (
        isEditingDashboardChart &&
        (place === 'savedChart' || place === 'newChart') &&
        action !== 'viewing'
    );
};
