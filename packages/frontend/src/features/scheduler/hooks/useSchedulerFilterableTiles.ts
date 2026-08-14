import {
    isDashboardChartTileType,
    type Dashboard,
    type DashboardFilterableField,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDashboardsAvailableFilters } from '../../../hooks/dashboard/useDashboard';
import { type SchedulerFilterableTiles } from '../utils/filterRequirements';

/**
 * The dashboard tiles plus each tile's filterable fields — needed to tell
 * whether a filter reaches a tile it doesn't explicitly target, and so which
 * tabs a required filter applies to.
 */
export const useSchedulerFilterableTiles = (
    dashboard: Dashboard | undefined,
): SchedulerFilterableTiles | undefined => {
    const savedChartUuidsAndTileUuids = useMemo(
        () =>
            dashboard?.tiles
                .filter(isDashboardChartTileType)
                .reduce<SavedChartsInfoForDashboardAvailableFilters>(
                    (acc, tile) => {
                        if (tile.properties.savedChartUuid) {
                            acc.push({
                                tileUuid: tile.uuid,
                                savedChartUuid: tile.properties.savedChartUuid,
                            });
                        }
                        return acc;
                    },
                    [],
                ) ?? [],
        [dashboard?.tiles],
    );

    const { data: availableFilters } = useDashboardsAvailableFilters(
        savedChartUuidsAndTileUuids,
        dashboard?.projectUuid,
    );

    const filterableFieldsByTileUuid = useMemo(() => {
        if (!availableFilters) return undefined;

        return savedChartUuidsAndTileUuids.reduce<
            Record<string, DashboardFilterableField[]>
        >((acc, { tileUuid }) => {
            const fields = [
                ...(availableFilters.savedQueryFilters[tileUuid]?.map(
                    (index) => availableFilters.allFilterableFields[index],
                ) ?? []),
                ...(availableFilters.savedQueryMetricFilters[tileUuid]?.map(
                    (index) => availableFilters.allFilterableMetrics[index],
                ) ?? []),
            ];
            if (fields.length > 0) {
                acc[tileUuid] = fields;
            }
            return acc;
        }, {});
    }, [availableFilters, savedChartUuidsAndTileUuids]);

    return useMemo(() => {
        if (!dashboard) return undefined;
        return {
            tiles: dashboard.tiles,
            filterableFieldsByTileUuid,
        };
    }, [dashboard, filterableFieldsByTileUuid]);
};
