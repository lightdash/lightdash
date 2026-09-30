import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardTile,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';

/** Keep execution settings opt-in and request keys stable when tiles move. */
export const getDashboardAvailableFilterSources = (
    tiles: DashboardTile[] | undefined,
    {
        includeBoundaryContext = false,
        includeUnpublishedDraft = false,
    }: {
        includeBoundaryContext?: boolean;
        includeUnpublishedDraft?: boolean;
    } = {},
): SavedChartsInfoForDashboardAvailableFilters =>
    (tiles ?? [])
        .flatMap((tile): SavedChartsInfoForDashboardAvailableFilters => {
            if (
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid
            ) {
                return [
                    {
                        tileUuid: tile.uuid,
                        savedChartUuid: tile.properties.savedChartUuid,
                        ...(includeUnpublishedDraft && {
                            includeUnpublishedDraft: true,
                        }),
                        ...(includeBoundaryContext && {
                            includeBoundaryContext: true,
                        }),
                    },
                ];
            }
            // SQL tiles get their filterable columns from query results. Only ask
            // availableFilters for their execution settings when boundaries need it.
            if (
                includeBoundaryContext &&
                isDashboardSqlChartTile(tile) &&
                tile.properties.savedSqlUuid
            ) {
                return [
                    {
                        tileUuid: tile.uuid,
                        savedSqlUuid: tile.properties.savedSqlUuid,
                        includeBoundaryContext: true,
                    },
                ];
            }
            return [];
        })
        .sort((a, b) => a.tileUuid.localeCompare(b.tileUuid));
