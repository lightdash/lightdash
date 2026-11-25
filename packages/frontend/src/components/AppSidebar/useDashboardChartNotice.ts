import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import {
    getDashboardChartPlace,
    hasLeftDashboardChart,
} from '../../hooks/dashboard/dashboardChartPlace';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useDashboardChartAction } from '../NavBar/useDashboardChartReturn';

/**
 * Whether the chart on screen is being edited or created for a dashboard.
 * The sidebar lets the user leave mid-task, so leaving drops the hand-over
 * instead of letting it follow them to other pages.
 */
export const useDashboardChartNotice = () => {
    const { pathname } = useLocation();
    const { isEditingDashboardChart, clearDashboardStorage } =
        useDashboardStorage();
    const action = useDashboardChartAction();
    const place = getDashboardChartPlace(pathname);
    const previousPlace = useRef(place);

    useEffect(() => {
        const previous = previousPlace.current;
        previousPlace.current = place;
        if (isEditingDashboardChart && hasLeftDashboardChart(previous, place)) {
            clearDashboardStorage();
        }
    }, [place, isEditingDashboardChart, clearDashboardStorage]);

    return (
        isEditingDashboardChart &&
        (place === 'savedChart' || place === 'newChart') &&
        action !== 'viewing'
    );
};
