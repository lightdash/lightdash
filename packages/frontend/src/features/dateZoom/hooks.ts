import {
    getTileControl,
    hasReservedParameterReference,
    isDashboardChartTileType,
    isStandardDateGranularity,
    type DateZoomConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectAvailableCustomGranularities,
    selectChartZoomableFieldsByTileUuid,
    selectDashboardTiles,
    selectTileParameterReferences,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
} from '../dashboard/store';
import { getGranularityLabel } from './utils';

/** The dashboard's enabled granularities, grouped standard vs custom. */
export const useGranularityOptions = () => {
    // Custom granularities discovered across the dashboard's tiles (same source
    // as the global picker). A control can zoom to these when available.
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    // The dashboard's enabled granularities (set in the default picker); every
    // control offers only these.
    const dateZoomGranularities = useDashboardDateZoomGranularities();

    // Only the dashboard's enabled granularities, grouped standard vs custom.
    return useMemo(() => {
        const standardItems = dateZoomGranularities
            .filter(isStandardDateGranularity)
            .map((granularity) => ({
                value: String(granularity),
                label: getGranularityLabel(
                    granularity,
                    availableCustomGranularities,
                ),
            }));
        const customItems = dateZoomGranularities
            .filter((g) => !isStandardDateGranularity(g))
            .sort((a, b) =>
                getGranularityLabel(
                    a,
                    availableCustomGranularities,
                ).localeCompare(
                    getGranularityLabel(b, availableCustomGranularities),
                ),
            )
            .map((key) => ({
                value: key,
                label: getGranularityLabel(key, availableCustomGranularities),
            }));
        if (customItems.length === 0) return standardItems;
        if (standardItems.length === 0) return customItems;
        return [
            { group: 'Standard', items: standardItems },
            { group: 'Custom', items: customItems },
        ];
    }, [dateZoomGranularities, availableCustomGranularities]);
};

/**
 * Chart tiles a control can touch: those that expose a zoomable date field
 * (a date/timestamp dimension the chart queries) OR reference the reserved
 * `date_zoom` parameter in custom SQL (param-only, no field to re-grain).
 * Each carries the control it is currently attached to (for conflict display).
 */
export const useEligibleZoomTiles = (
    config: DateZoomConfig,
    controlUuid: string,
) => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const chartZoomableFieldsByTileUuid = useDashboardSelector(
        selectChartZoomableFieldsByTileUuid,
    );
    // Param-only tiles (custom SQL referencing `${ld.parameters.date_zoom}` but
    // no re-grainable date field) are also affected by a control's grain.
    const tileParameterReferences = useDashboardSelector(
        selectTileParameterReferences,
    );
    return useMemo(() => {
        return (dashboardTiles ?? [])
            .filter(isDashboardChartTileType)
            .map((tile) => {
                const zoomableFields =
                    chartZoomableFieldsByTileUuid[tile.uuid] ?? [];
                const isParamOnly =
                    zoomableFields.length === 0 &&
                    hasReservedParameterReference(
                        tileParameterReferences?.[tile.uuid] ?? [],
                    );
                const otherControl = getTileControl(config, tile.uuid);
                const conflictControl =
                    otherControl && otherControl.uuid !== controlUuid
                        ? otherControl
                        : undefined;
                const label =
                    (tile.properties.title?.length
                        ? tile.properties.title
                        : tile.properties.chartName) || 'Untitled chart';
                return {
                    tile,
                    tabUuid: tile.tabUuid ?? undefined,
                    zoomableFields,
                    isParamOnly,
                    conflictControl,
                    label,
                };
            })
            .filter(
                ({ zoomableFields, isParamOnly }) =>
                    zoomableFields.length > 0 || isParamOnly,
            );
    }, [
        dashboardTiles,
        chartZoomableFieldsByTileUuid,
        tileParameterReferences,
        config,
        controlUuid,
    ]);
};

export type EligibleZoomTile = ReturnType<typeof useEligibleZoomTiles>[number];
