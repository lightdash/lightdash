import { ChartSourceType } from '../types/content';
import { DashboardTileTypes, type DashboardTile } from '../types/dashboard';
import { ParameterError } from '../types/errors';
import assertUnreachable from './assertUnreachable';

export const convertChartSourceTypeToDashboardTileType = (
    sourceType: ChartSourceType,
): DashboardTileTypes => {
    switch (sourceType) {
        case ChartSourceType.DBT_EXPLORE:
            return DashboardTileTypes.SAVED_CHART;
        case ChartSourceType.SQL:
            return DashboardTileTypes.SQL_CHART;
        default:
            return assertUnreachable(
                sourceType,
                `Unknown source type: ${sourceType}`,
            );
    }
};

/**
 * Whether a tile should be rendered for the given tab selection.
 *
 * Includes orphan (legacy) tiles — tiles whose `tabUuid` is null/undefined —
 * regardless of `selectedTabs`, mirroring the frontend behaviour that surfaces
 * legacy tiles on the first tab. When `selectedTabs` is null, no filtering is
 * applied. See PROD-2505.
 */
export const isTileInSelectedTabs = (
    tile: { tabUuid?: string | null },
    selectedTabs: (string | null)[] | null,
): boolean =>
    !selectedTabs || !tile.tabUuid || selectedTabs.includes(tile.tabUuid);

/**
 * Expands a null ("all tabs") selection into the explicit list the minimal
 * dashboard render expects in its `selectedTabs` URL param: every tab UUID
 * present on the tiles, plus a `null` sentinel for orphan (no-tab) tiles.
 * Without the explicit list the minimal render falls back to showing only the
 * active (first) tab. See PROD-2505.
 */
export const expandSelectedTabs = (
    selectedTabs: string[] | null,
    tiles: { tabUuid?: string | null }[],
): (string | null)[] =>
    selectedTabs ?? [...new Set(tiles.map((tile) => tile.tabUuid ?? null))];

/**
 * Validates that selected tabs exist in the dashboard tiles.
 * If selectedTabs is provided and not empty, ensures at least one selected tab exists in dashboard tabs.
 * @param selectedTabs - Array of selected tab UUIDs or null
 * @param dashboardTiles - Array of dashboard tiles
 * @throws ParameterError if none of the selected tabs exist in the dashboard
 */
export const validateSelectedTabs = (
    selectedTabs: string[] | null,
    dashboardTiles: DashboardTile[],
): void => {
    // If selectedTabs is provided and not empty, validate that at least one exists in dashboard tabs
    if (selectedTabs && selectedTabs.length > 0) {
        const availableTabs = dashboardTiles
            .map((tile) => tile.tabUuid)
            .filter((tabUuid): tabUuid is string => !!tabUuid)
            .filter((tabUuid, index, self) => self.indexOf(tabUuid) === index);

        const validSelectedTabs = selectedTabs.filter((tabUuid) =>
            availableTabs.includes(tabUuid),
        );
        if (validSelectedTabs.length === 0) {
            throw new ParameterError(
                `None of the selected tabs exist in the dashboard`,
            );
        }
    }
};

export type DashboardLimits = {
    maxTilesPerTab: number;
    maxTabsPerDashboard: number;
};

type LimitedDashboard = {
    tiles: { tabUuid?: string | null }[];
    tabs: { uuid: string; name: string; order: number }[];
};

/**
 * Tiles of every type count. Tiles without a tab, or with a tab that doesn't
 * exist (saving drops it), render on the first tab.
 */
export const getDashboardTileCountsByTab = ({
    tiles,
    tabs,
}: LimitedDashboard): Map<string | null, number> => {
    const firstTab = [...tabs].sort((a, b) => a.order - b.order)[0];
    const tabUuids = new Set(tabs.map((tab) => tab.uuid));
    return tiles.reduce<Map<string | null, number>>((counts, tile) => {
        const tabUuid =
            tile.tabUuid && tabUuids.has(tile.tabUuid)
                ? tile.tabUuid
                : (firstTab?.uuid ?? null);
        return counts.set(tabUuid, (counts.get(tabUuid) ?? 0) + 1);
    }, new Map());
};

export type DashboardLimitViolation =
    | { type: 'tabs'; count: number; limit: number }
    | {
          type: 'tiles';
          tabUuid: string | null;
          tabName: string | null;
          count: number;
          limit: number;
      };

/**
 * With a saved dashboard, counts that are not above the saved ones are not
 * violations, so a dashboard already over a limit can be saved until it grows.
 */
export const getDashboardLimitViolations = (
    dashboard: LimitedDashboard,
    { maxTilesPerTab, maxTabsPerDashboard }: DashboardLimits,
    savedDashboard: LimitedDashboard | null,
): DashboardLimitViolation[] => {
    const savedTileCounts = savedDashboard
        ? getDashboardTileCountsByTab(savedDashboard)
        : new Map<string | null, number>();
    const firstTabUuid = [...dashboard.tabs].sort(
        (a, b) => a.order - b.order,
    )[0]?.uuid;
    // Tiles saved without tabs render on the first tab once tabs are added
    const getSavedTileCount = (tabUuid: string | null) =>
        savedTileCounts.get(tabUuid) ??
        (tabUuid === firstTabUuid ? savedTileCounts.get(null) : undefined) ??
        0;
    const tabViolations: DashboardLimitViolation[] =
        dashboard.tabs.length >
        Math.max(maxTabsPerDashboard, savedDashboard?.tabs.length ?? 0)
            ? [
                  {
                      type: 'tabs',
                      count: dashboard.tabs.length,
                      limit: maxTabsPerDashboard,
                  },
              ]
            : [];
    const tileViolations = [...getDashboardTileCountsByTab(dashboard).entries()]
        .filter(
            ([tabUuid, count]) =>
                count > Math.max(maxTilesPerTab, getSavedTileCount(tabUuid)),
        )
        .map(
            ([tabUuid, count]): DashboardLimitViolation => ({
                type: 'tiles',
                tabUuid,
                tabName:
                    dashboard.tabs.find((tab) => tab.uuid === tabUuid)?.name ??
                    null,
                count,
                limit: maxTilesPerTab,
            }),
        );
    return [...tabViolations, ...tileViolations];
};

export const assertDashboardWithinLimits = (
    dashboard: LimitedDashboard,
    limits: DashboardLimits,
    savedDashboard: LimitedDashboard | null,
): void => {
    const [violation] = getDashboardLimitViolations(
        dashboard,
        limits,
        savedDashboard,
    );
    if (!violation) return;
    if (violation.type === 'tabs') {
        throw new ParameterError(
            `Dashboard has ${violation.count} tabs, which is over the limit of ${violation.limit} tabs per dashboard`,
        );
    }
    throw new ParameterError(
        violation.tabName
            ? `Tab "${violation.tabName}" has ${violation.count} tiles, which is over the limit of ${violation.limit} tiles per tab`
            : `Dashboard has ${violation.count} tiles, which is over the limit of ${violation.limit} tiles per tab`,
    );
};
