import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { doesFilterApplyToTile } from '../dashboardFilters/FilterConfiguration/utils';

export type FilterSidebarSnapshot = {
    dashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
};

export const findFilterRule = (
    filters: DashboardFilters,
    filterId: string,
): DashboardFilterRule | null =>
    filters.dimensions.find((rule) => rule.id === filterId) ??
    filters.metrics.find((rule) => rule.id === filterId) ??
    null;

export const replaceFilterRule = (
    filters: DashboardFilters,
    next: DashboardFilterRule,
): DashboardFilters => ({
    ...filters,
    dimensions: filters.dimensions.map((rule) =>
        rule.id === next.id ? next : rule,
    ),
    metrics: filters.metrics.map((rule) => (rule.id === next.id ? next : rule)),
});

export const isFilterRuleDirty = (
    snapshot: DashboardFilters,
    current: DashboardFilters,
    filterId: string,
): boolean =>
    !isEqual(
        findFilterRule(snapshot, filterId),
        findFilterRule(current, filterId),
    );

export type FilterReachGroup = {
    tabUuid: string | null;
    name: string;
    applied: number;
    total: number;
};

export type FilterReach = {
    groups: FilterReachGroup[];
    applied: number;
    total: number;
    tabCount: number;
};

// Charts are the tiles that expose filterable fields.
export const getFilterReach = (
    rule: DashboardFilterRule,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined,
): FilterReach => {
    const charts = tiles.filter(
        (tile) => filterableFieldsByTileUuid?.[tile.uuid] !== undefined,
    );
    const toGroup = (
        tabUuid: string | null,
        name: string,
        groupTiles: DashboardTile[],
    ): FilterReachGroup => ({
        tabUuid,
        name,
        total: groupTiles.length,
        applied: groupTiles.filter((tile) =>
            doesFilterApplyToTile(rule, tile, filterableFieldsByTileUuid),
        ).length,
    });
    const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
    const groups =
        sortedTabs.length > 0
            ? sortedTabs.map((tab) =>
                  toGroup(
                      tab.uuid,
                      tab.name,
                      charts.filter((tile) => tile.tabUuid === tab.uuid),
                  ),
              )
            : [toGroup(null, 'Dashboard', charts)];
    return {
        groups,
        applied: groups.reduce((sum, group) => sum + group.applied, 0),
        total: groups.reduce((sum, group) => sum + group.total, 0),
        tabCount: groups.filter((group) => group.applied > 0).length,
    };
};
