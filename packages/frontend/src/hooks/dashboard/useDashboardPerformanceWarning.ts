import {
    getDashboardLimitViolations,
    type Dashboard,
    type DashboardLimitViolation,
} from '@lightdash/common';
import { useMemo } from 'react';
import useApp from '../../providers/App/useApp';

type TileLimitViolation = Extract<DashboardLimitViolation, { type: 'tiles' }>;

type PerformanceWarning = {
    hasWarning: boolean;
    tabsExceedingLimit: TileLimitViolation[];
    totalTileCount: number;
    totalTabs: number;
};

/**
 * Flags dashboards over the tiles-per-tab or tabs-per-dashboard limit, which
 * are based on DOM node constraints that can slow the browser down.
 */
const useDashboardPerformanceWarning = (
    dashboardTiles: Dashboard['tiles'] | undefined,
    dashboardTabs: Dashboard['tabs'] | undefined,
): PerformanceWarning => {
    const { health } = useApp();

    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab ?? 50;
    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard ?? 20;

    return useMemo(() => {
        const tiles = dashboardTiles ?? [];
        const tabs = dashboardTabs ?? [];
        const violations = getDashboardLimitViolations(
            { tiles, tabs },
            { maxTilesPerTab, maxTabsPerDashboard },
        );
        return {
            hasWarning: violations.length > 0,
            tabsExceedingLimit: violations.filter(
                (v): v is TileLimitViolation => v.type === 'tiles',
            ),
            totalTileCount: tiles.length,
            totalTabs: Math.max(tabs.length, 1),
        };
    }, [dashboardTiles, dashboardTabs, maxTilesPerTab, maxTabsPerDashboard]);
};

export default useDashboardPerformanceWarning;
