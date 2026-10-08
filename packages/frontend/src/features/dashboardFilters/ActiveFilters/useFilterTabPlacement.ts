import { type DashboardFilterRule } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    doesFilterApplyToAnyTile,
    getTabsForFilterRule,
} from '../FilterConfiguration/utils';

// Hide filter if it doesn't apply to the current tab
// But always show orphaned filters so users can see and fix them
export const isFilterHiddenOnTab = (
    appliesToTabs: string[],
    activeTabUuid: string | undefined,
): boolean => {
    const isOrphanedFilter = appliesToTabs.length === 0;
    const appliedToCurrentTab =
        !activeTabUuid || appliesToTabs.includes(activeTabUuid);

    return !appliedToCurrentTab && !isOrphanedFilter;
};

export const useFilterTabPlacement = () => {
    const getUiString = useUiStrings();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const sortedTabUuids = useMemo(() => {
        const sortedTabs = dashboardTabs?.sort((a, b) => a.order - b.order);
        return sortedTabs?.map((tab) => tab.uuid) || [];
    }, [dashboardTabs]);

    // Tabs are only "enabled" when there's more than one tab
    const tabsEnabled = dashboardTabs && dashboardTabs.length > 1;

    // Compute which tabs a filter applies to based on tileTargets
    // Note: We use getTabsForFilterRule because getTabUuidsForFilterRules from common
    // skips disabled filters, but required filters ARE disabled until a value is set
    const getTabsUsingFilter = useCallback(
        (filterRule: DashboardFilterRule) =>
            getTabsForFilterRule(
                filterRule,
                dashboardTiles,
                sortedTabUuids,
                filterableFieldsByTileUuid,
            ),
        [dashboardTiles, sortedTabUuids, filterableFieldsByTileUuid],
    );

    // Compute orphaned state for a filter
    // - With multiple tabs: orphaned if filter applies to no tabs
    // - With single/no tabs: orphaned if filter applies to no tiles
    const getOrphanedState = useCallback(
        (
            filterRule: DashboardFilterRule,
            appliesToTabs: string[],
        ): { isOrphaned: boolean; orphanedTooltip: string } => {
            if (tabsEnabled) {
                return {
                    isOrphaned: appliesToTabs.length === 0,
                    orphanedTooltip: getUiString('filters.notAppliedToAnyTabs'),
                };
            }
            // Single tab or no tabs - check if filter applies to any tile
            const appliesToAnyTile = doesFilterApplyToAnyTile(
                filterRule,
                dashboardTiles,
                filterableFieldsByTileUuid,
            );
            return {
                isOrphaned: !appliesToAnyTile,
                orphanedTooltip: getUiString('filters.notAppliedToAnyTiles'),
            };
        },
        [tabsEnabled, dashboardTiles, filterableFieldsByTileUuid, getUiString],
    );

    return { getTabsUsingFilter, getOrphanedState };
};
