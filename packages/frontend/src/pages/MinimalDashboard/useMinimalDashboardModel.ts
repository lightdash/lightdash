import type {
    Dashboard,
    DashboardFilterRule,
    ParametersValuesMap,
} from '@lightdash/common';
import {
    isDashboardScheduler,
    isTileInSelectedTabs,
    SessionStorageKeys,
} from '@lightdash/common';
import { useSessionStorage } from '@mantine/hooks';
import { useMemo } from 'react';
import { type Layout } from 'react-grid-layout';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../../features/dashboardTabs/gridUtils';
import { useScheduler } from '../../features/scheduler/hooks/useScheduler';
import { useDashboardQuery } from '../../hooks/dashboard/useDashboard';
import {
    getActiveDashboardTab,
    getDateZoomGranularityFromSearch,
    sortDashboardTabs,
} from '../../providers/Dashboard/dashboardPageUtils';
import { useDashboardPageContext } from '../../providers/Dashboard/useDashboardPageContext';
import {
    type MinimalDashboardModel,
    type MinimalDashboardTabGroup,
} from './minimalDashboardTypes';

type MinimalDashboardModelResult =
    | {
          status: 'loading';
      }
    | {
          status: 'error';
          error: string;
      }
    | {
          status: 'ready';
          model: MinimalDashboardModel;
      };

const buildLayouts = (
    tiles: Dashboard['tiles'],
    cols: { lg: number; md: number },
): { lg: Layout[]; md: Layout[] } => ({
    lg: tiles.map((tile) => getReactGridLayoutConfig(tile, false, cols.lg)),
    md: tiles.map((tile) => getReactGridLayoutConfig(tile, false, cols.md)),
});

export const useMinimalDashboardModel = (): MinimalDashboardModelResult => {
    const projectUuid = useDashboardPageContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardPageContext((c) => c.dashboardUuid);
    const tabUuid = useDashboardPageContext((c) => c.tabUuid);
    const search = useDashboardPageContext((c) => c.search);
    const switchToTab = useDashboardPageContext((c) => c.switchToTab);

    const searchParams = useMemo(() => new URLSearchParams(search), [search]);
    const schedulerUuid = searchParams.get('schedulerUuid');
    const schedulerTabs = searchParams.get('selectedTabs');
    const dateZoom = useMemo(
        () => getDateZoomGranularityFromSearch(search),
        [search],
    );

    const [sendNowSchedulerFilters] = useSessionStorage<
        DashboardFilterRule[] | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS,
    });

    const [sendNowSchedulerParameters] = useSessionStorage<
        ParametersValuesMap | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_PARAMETERS,
    });

    const {
        data: dashboard,
        isError: isDashboardError,
        error: dashboardError,
    } = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
    });

    const {
        data: scheduler,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(schedulerUuid, {
        enabled: !!schedulerUuid && !sendNowSchedulerFilters,
    });

    const schedulerFilters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.filters;
        }

        return sendNowSchedulerFilters;
    }, [scheduler, schedulerUuid, sendNowSchedulerFilters]);

    const schedulerParameters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.parameters;
        }

        return sendNowSchedulerParameters;
    }, [scheduler, schedulerUuid, sendNowSchedulerParameters]);

    const schedulerTabsSelected = useMemo(() => {
        if (schedulerTabs) {
            return JSON.parse(schedulerTabs) as string[];
        }
        return undefined;
    }, [schedulerTabs]);

    const sortedTabs = useMemo(
        () => sortDashboardTabs(dashboard?.tabs ?? []),
        [dashboard?.tabs],
    );
    const navigableTabs = useMemo(
        () => sortedTabs.filter((tab) => !tab.hidden),
        [sortedTabs],
    );

    const activeTab = useMemo(
        () =>
            getActiveDashboardTab({
                tabs: dashboard?.tabs ?? [],
                tabUuid,
                isEditMode: false,
            }) ?? null,
        [dashboard?.tabs, tabUuid],
    );

    const gridProps = useMemo(
        () =>
            getResponsiveGridLayoutProps({
                stackVerticallyOnSmallestBreakpoint: true,
            }),
        [],
    );

    const filteredAndSortedDashboardTiles = useMemo(() => {
        const filteredTiles =
            dashboard?.tiles.filter((tile) => {
                if (schedulerTabsSelected) {
                    return isTileInSelectedTabs(tile, schedulerTabsSelected);
                }

                if (!activeTab) {
                    return true;
                }

                if (tile.tabUuid === activeTab.uuid) return true;

                const tileHasNoTab = !tile.tabUuid;
                const isFirstTab =
                    activeTab.uuid ===
                    (navigableTabs[0]?.uuid ?? sortedTabs[0]?.uuid);

                return tileHasNoTab && isFirstTab;
            }) ?? [];

        return filteredTiles.sort((a, b) => {
            const tabAIndex = sortedTabs.findIndex(
                (tab) => tab.uuid === a.tabUuid,
            );
            const tabBIndex = sortedTabs.findIndex(
                (tab) => tab.uuid === b.tabUuid,
            );
            return tabAIndex - tabBIndex;
        });
    }, [
        dashboard?.tiles,
        schedulerTabsSelected,
        activeTab,
        navigableTabs,
        sortedTabs,
    ]);

    const layouts = useMemo(
        () => buildLayouts(filteredAndSortedDashboardTiles, gridProps.cols),
        [filteredAndSortedDashboardTiles, gridProps.cols],
    );

    const tabGroups = useMemo<MinimalDashboardTabGroup[] | null>(() => {
        if (!schedulerTabsSelected) return null;

        const tilesByTab = new Map<string, Dashboard['tiles']>();
        const orphanTiles: Dashboard['tiles'] = [];
        for (const tile of filteredAndSortedDashboardTiles) {
            if (!tile.tabUuid) {
                orphanTiles.push(tile);
                continue;
            }
            const bucket = tilesByTab.get(tile.tabUuid) ?? [];
            bucket.push(tile);
            tilesByTab.set(tile.tabUuid, bucket);
        }

        const groups: MinimalDashboardTabGroup[] = [];
        let orphansAssigned = false;
        for (const tab of sortedTabs) {
            const tabTiles = tilesByTab.get(tab.uuid);
            if (!tabTiles || tabTiles.length === 0) continue;

            const tiles =
                !orphansAssigned && orphanTiles.length > 0
                    ? [...orphanTiles, ...tabTiles]
                    : tabTiles;
            if (!orphansAssigned && orphanTiles.length > 0) {
                orphansAssigned = true;
            }
            groups.push({
                key: tab.uuid,
                tiles,
                layouts: buildLayouts(tiles, gridProps.cols),
            });
        }

        if (!orphansAssigned && orphanTiles.length > 0) {
            groups.push({
                key: 'orphan-tiles',
                tiles: orphanTiles,
                layouts: buildLayouts(orphanTiles, gridProps.cols),
            });
        }

        return groups;
    }, [
        filteredAndSortedDashboardTiles,
        gridProps.cols,
        schedulerTabsSelected,
        sortedTabs,
    ]);

    if (isDashboardError || isSchedulerError) {
        if (dashboardError) {
            return { status: 'error', error: dashboardError.error.message };
        }
        if (schedulerError) {
            return { status: 'error', error: schedulerError.error.message };
        }
    }

    if (!dashboard) {
        return { status: 'loading' };
    }

    if (schedulerUuid && !scheduler) {
        return { status: 'loading' };
    }

    if (dashboard.tiles.length === 0) {
        return { status: 'error', error: 'No tiles' };
    }

    const isTabEmpty =
        activeTab && filteredAndSortedDashboardTiles.length === 0;

    return {
        status: 'ready',
        model: {
            projectUuid,
            dashboardUuid,
            dashboard,
            activeTab,
            navigableTabs,
            filteredAndSortedDashboardTiles,
            layouts,
            tabGroups,
            schedulerFilters,
            schedulerParameters,
            schedulerTabsSelected,
            dateZoom,
            isTabEmpty: !!isTabEmpty,
            canNavigateBetweenTabs:
                !schedulerTabsSelected && navigableTabs.length > 0,
            onTabChange: switchToTab,
        },
    };
};
