import {
    DashboardTileTypes,
    type Dashboard,
    type DashboardBlueprint,
} from '@lightdash/common';

export const DASHBOARD_BLUEPRINT_PATH = '/tmp/dashboard/blueprint.json';

export const buildDashboardBlueprint = (
    dashboard: Dashboard,
): DashboardBlueprint => ({
    dashboardUuid: dashboard.uuid,
    name: dashboard.name,
    description: dashboard.description ?? null,
    tabs: [...dashboard.tabs].sort((a, b) => a.order - b.order),
    tiles: dashboard.tiles,
    filters: dashboard.filters,
    parameters: dashboard.parameters ?? null,
    config: dashboard.config ?? null,
});

const TILE_TYPE_LABELS: Record<DashboardTileTypes, string> = {
    [DashboardTileTypes.SAVED_CHART]: 'chart',
    [DashboardTileTypes.SQL_CHART]: 'SQL chart',
    [DashboardTileTypes.MARKDOWN]: 'markdown',
    [DashboardTileTypes.LOOM]: 'video',
    [DashboardTileTypes.HEADING]: 'heading',
    [DashboardTileTypes.DATA_APP]: 'data app',
};

/**
 * Compact one-line summary of the blueprint's shape, e.g.
 * "2 tabs, 12 tiles (8 chart, 3 markdown, 1 heading), 4 filters".
 */
export const describeDashboardBlueprint = (
    blueprint: DashboardBlueprint,
): string => {
    const counts = new Map<DashboardTileTypes, number>();
    for (const tile of blueprint.tiles) {
        counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
    }
    const tileBreakdown = [...counts.entries()]
        .map(([type, count]) => `${count} ${TILE_TYPE_LABELS[type]}`)
        .join(', ');
    const filterCount =
        blueprint.filters.dimensions.length +
        blueprint.filters.metrics.length +
        blueprint.filters.tableCalculations.length;
    return [
        `${blueprint.tabs.length} tab${blueprint.tabs.length === 1 ? '' : 's'}`,
        `${blueprint.tiles.length} tile${
            blueprint.tiles.length === 1 ? '' : 's'
        }${tileBreakdown ? ` (${tileBreakdown})` : ''}`,
        `${filterCount} filter${filterCount === 1 ? '' : 's'}`,
    ].join(', ');
};

/**
 * Prompt block prepended above the chart-reference listing when a dashboard
 * is attached. Frames the blueprint as the layout spec so the agent recreates
 * the dashboard's structure instead of designing one from scratch.
 */
export const dashboardBlueprintPromptBlock = (
    blueprint: DashboardBlueprint,
): string =>
    `[Attached dashboard "${blueprint.name}" — structural blueprint at ${DASHBOARD_BLUEPRINT_PATH}]\n` +
    `The user attached a Lightdash dashboard (${describeDashboardBlueprint(
        blueprint,
    )}). ` +
    `The blueprint JSON maps its full structure: tabs, tile grid positions, tile types and titles, dashboard filters, and which saved chart each tile renders. ` +
    `Match chart tiles to the metric-query files via properties.savedChartUuid = chartUuid. ` +
    `Read /app/references/dashboard-blueprint.md for the JSON shape and layout mapping rules. ` +
    `Unless the user asks for a different design, treat the blueprint as the layout spec: recreate its tabs, tile arrangement, and filters rather than inventing a new structure.\n\n`;
