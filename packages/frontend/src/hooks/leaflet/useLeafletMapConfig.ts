import {
    getItemLabelWithoutTableName,
    MapChartLocation,
    MapChartType,
    MapTileBackground,
    type MapFieldConfig,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';
import { isMapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { type MapExtent } from '../../providers/Explorer/types';

type Args = {
    isInDashboard: boolean;
};

export type ScatterPoint = {
    lat: number;
    lon: number;
    value: number | null;
    displayValue: string | number;
    sizeValue: number;
    rowData: Record<string, any>;
};

export type RegionData = {
    name: string;
    value: number;
    rowData: Record<string, any>;
};

// Field info for rendering in tooltips
export type TooltipFieldInfo = {
    fieldId: string;
    label: string;
    visible: boolean;
};

export type TileConfig = {
    url: string | null;
    attribution: string;
};

export type LeafletMapConfig = {
    scatterData: ScatterPoint[] | null;
    regionData: RegionData[] | null;
    isLatLong: boolean;
    locationType: MapChartType;
    mapType: MapChartLocation;
    geoJsonUrl: string | null;
    // Property key to match in GeoJSON features (e.g., 'name', 'ISO3166-1-Alpha-3')
    geoJsonPropertyKey: string;
    // Map extent (position and zoom level)
    extent: MapExtent;
    // True if the extent came from a saved chart (not defaults)
    hasSavedExtent: boolean;
    colors: {
        primary: string;
        scale: string[];
    };
    minBubbleSize: number;
    maxBubbleSize: number;
    sizeRange: {
        min: number;
        max: number;
        formattedMin: string;
        formattedMax: string;
    } | null;
    sizeFieldLabel: string | null;
    heatmapConfig: {
        radius: number;
        blur: number;
        opacity: number;
    };
    tile: TileConfig;
    backgroundColor: string | null;
    // Color for regions with no matching data (area maps)
    noDataColor: string;
    // Opacity for scatter and area map data layers (0.1 to 1)
    dataLayerOpacity: number;
    showLegend: boolean;
    valueRange: {
        min: number;
        max: number;
        // using formatted min/max instead of nesting so the changes are easier to track
        formattedMin: string;
        formattedMax: string;
    } | null;
    valueFieldLabel: string | null;
    // The field ID used for location matching (for deriving labels)
    locationFieldId: string | null;
    // Field configuration for tooltips
    tooltipFields: TooltipFieldInfo[];
};

const getGeoJsonUrl = (
    mapType: MapChartLocation,
    customUrl?: string,
): string | null => {
    if (mapType === MapChartLocation.CUSTOM) {
        if (!customUrl) {
            // Custom region selected but no URL provided - return null to clear shapes
            return null;
        }
        const isExternalUrl =
            customUrl.startsWith('http://') || customUrl.startsWith('https://');
        if (isExternalUrl) {
            return `/api/v1/geojson-proxy?url=${encodeURIComponent(customUrl)}`;
        }
        return customUrl;
    }

    switch (mapType) {
        case MapChartLocation.USA:
            return '/geojson/us-states.geojson';
        case MapChartLocation.WORLD:
            return '/geojson/countries.geojson';
        default:
            return '/geojson/countries.geojson';
    }
};

const getMapCenter = (mapType: MapChartLocation): [number, number] => {
    switch (mapType) {
        case MapChartLocation.USA:
            return [39.8283, -98.5795]; // Center of USA
        case MapChartLocation.EUROPE:
            return [54.526, 15.2551]; // Center of Europe
        case MapChartLocation.WORLD:
        default:
            return [20, 0]; // Center of world
    }
};

const getMapZoom = (mapType: MapChartLocation): number => {
    switch (mapType) {
        case MapChartLocation.USA:
            return 4;
        case MapChartLocation.EUROPE:
            return 4;
        case MapChartLocation.WORLD:
        default:
            return 2;
    }
};

const getTileConfig = (
    background: MapTileBackground | undefined,
): TileConfig => {
    switch (background) {
        case MapTileBackground.NONE:
            // No base map tiles. Useful for overlays-only views or custom rendering.
            return {
                url: null,
                attribution: '',
            };

        // NOTE: Esri World Imagery is used under fair-use terms.
        // If usage increases, switch to a licensed or self-hosted provider.
        case MapTileBackground.SATELLITE:
            return {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution:
                    'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            };

        case MapTileBackground.LIGHT:
        default:
        case MapTileBackground.OPENSTREETMAP:
            // OpenStreetMap standard tiles.
            // Community-run, attribution-only, fair-use. Suitable for low–moderate traffic.
            // Not intended for heavy commercial usage or guaranteed SLA.
            return {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            };
    }
};

const useLeafletMapConfig = ({
    isInDashboard: _isInDashboard,
}: Args): LeafletMapConfig | null => {
    const { visualizationConfig, resultsData, itemsMap } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isMapVisualizationConfig(visualizationConfig)) return null;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    return useMemo(() => {
        if (!chartConfig) return null;

        const {
            mapType: configMapType,
            customGeoJsonUrl,
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            geoJsonPropertyKey: configGeoJsonPropertyKey,
            valueFieldId,
            colorRange,
            defaultZoom,
            defaultCenterLat,
            defaultCenterLon,
            minBubbleSize,
            maxBubbleSize,
            sizeFieldId,
            heatmapConfig,
            tileBackground,
            backgroundColor,
            noDataColor,
            dataLayerOpacity,
            showLegend,
            fieldConfig,
        } = chartConfig.validConfig || {};

        // Helper to check if a field is a lat/lon field (should be excluded from tooltips)
        const isLatLonField = (fieldId: string): boolean => {
            // First check if it's the selected lat/lon field
            if (fieldId === latitudeFieldId || fieldId === longitudeFieldId) {
                return true;
            }
            // Then check by label pattern
            const item = itemsMap?.[fieldId];
            if (!item) return false;
            const label = getItemLabelWithoutTableName(item).toLowerCase();
            return (
                label === 'lat' ||
                label === 'latitude' ||
                label === 'lon' ||
                label === 'long' ||
                label === 'longitude'
            );
        };

        // Build tooltip field info from itemsMap and fieldConfig, excluding lat/lon fields
        const tooltipFields: TooltipFieldInfo[] = itemsMap
            ? Object.entries(itemsMap)
                  .filter(([fieldId]) => !isLatLonField(fieldId))
                  .map(([fieldId, item]) => {
                      const config: MapFieldConfig | undefined =
                          fieldConfig?.[fieldId];

                      const defaultLabel = getItemLabelWithoutTableName(item);
                      const label = config?.label || defaultLabel;

                      const visible = config?.visible !== false;
                      return { fieldId, label, visible };
                  })
            : [];

        const mapType = configMapType || MapChartLocation.WORLD;
        const isLatLong =
            !locationType ||
            locationType === MapChartType.SCATTER ||
            locationType === MapChartType.HEATMAP;

        let scatterData: ScatterPoint[] | null = null;
        let regionData: RegionData[] | null = null;

        if (resultsData?.rows && resultsData.rows.length > 0) {
            if (isLatLong) {
                // Scatter plot mode
                const mappedData = resultsData.rows
                    .map((row) => {
                        if (!latitudeFieldId || !longitudeFieldId) return null;

                        const lat = Number(row[latitudeFieldId]?.value.raw);
                        const lon = Number(row[longitudeFieldId]?.value.raw);

                        // Handle value field - support both numeric and non-numeric values
                        const rawValue = valueFieldId
                            ? row[valueFieldId]?.value.raw
                            : 1;
                        const numericValue = Number(rawValue);
                        // Check for null/undefined/empty explicitly since Number(null) = 0, Number('') = 0
                        const isNumeric =
                            rawValue !== null &&
                            rawValue !== undefined &&
                            rawValue !== '' &&
                            !isNaN(numericValue);
                        const value = isNumeric ? numericValue : null;
                        const displayValue = valueFieldId
                            ? (row[valueFieldId]?.value.formatted ??
                              row[valueFieldId]?.value.raw ??
                              rawValue)
                            : 1;

                        // Use sizeFieldId if set, otherwise use constant size
                        const sizeValue = sizeFieldId
                            ? Number(row[sizeFieldId]?.value.raw)
                            : 1;

                        if (isNaN(lat) || isNaN(lon)) return null;

                        return {
                            lat,
                            lon,
                            value,
                            displayValue,
                            sizeValue: isNaN(sizeValue) ? 1 : sizeValue,
                            rowData: row as Record<string, any>,
                        };
                    })
                    .filter((d): d is NonNullable<typeof d> => d !== null);
                scatterData = mappedData;
            } else {
                // Choropleth mode
                regionData = resultsData.rows
                    .map((row) => {
                        if (!locationFieldId) return null;

                        const locationName = String(
                            row[locationFieldId]?.value.raw || '',
                        );
                        const value = valueFieldId
                            ? Number(row[valueFieldId]?.value.raw)
                            : 1;

                        if (!locationName) return null;

                        return {
                            name: locationName,
                            value: isNaN(value) ? 0 : value,
                            rowData: row as Record<string, any>,
                        };
                    })
                    .filter((d): d is RegionData => d !== null);
            }
        }

        // Calculate extent - use saved values if provided, otherwise defaults based on map type
        const hasSavedExtent =
            defaultCenterLat !== undefined && defaultCenterLon !== undefined;
        const defaultCenter = getMapCenter(mapType);
        const extent: MapExtent = {
            lat: hasSavedExtent ? defaultCenterLat : defaultCenter[0],
            lng: hasSavedExtent ? defaultCenterLon : defaultCenter[1],
            zoom: defaultZoom ?? getMapZoom(mapType),
        };

        // Calculate value range for legend (includes both raw and formatted values)
        let valueRange: {
            min: number;
            max: number;
            formattedMin: string;
            formattedMax: string;
        } | null = null;
        let sizeRange: {
            min: number;
            max: number;
            formattedMin: string;
            formattedMax: string;
        } | null = null;
        if (scatterData && scatterData.length > 0) {
            // Single pass to find min/max for both value and size
            let minPoint: (ScatterPoint & { value: number }) | null = null;
            let maxPoint: (ScatterPoint & { value: number }) | null = null;
            let minSizePoint = scatterData[0];
            let maxSizePoint = scatterData[0];

            for (const point of scatterData) {
                // Track size range (keep the point reference for formatted values)
                if (point.sizeValue < minSizePoint.sizeValue)
                    minSizePoint = point;
                if (point.sizeValue > maxSizePoint.sizeValue)
                    maxSizePoint = point;

                // Track value range (only for numeric values)
                if (point.value !== null) {
                    if (!minPoint || point.value < minPoint.value) {
                        minPoint = point as ScatterPoint & { value: number };
                    }
                    if (!maxPoint || point.value > maxPoint.value) {
                        maxPoint = point as ScatterPoint & { value: number };
                    }
                }
            }

            // Only set valueRange when valueFieldId is set, otherwise all points
            // have displayValue: 1 and the legend would show a meaningless "1 - 1" range
            if (minPoint && maxPoint && valueFieldId) {
                valueRange = {
                    min: Math.min(minPoint.value, 0),
                    max: Math.max(maxPoint.value, 1),
                    formattedMin: String(minPoint.displayValue),
                    formattedMax: String(maxPoint.displayValue),
                };
            }

            // Only set sizeRange when sizeFieldId is set
            if (sizeFieldId) {
                const formattedMinSize =
                    minSizePoint.rowData[sizeFieldId]?.value?.formatted ??
                    String(minSizePoint.sizeValue);
                const formattedMaxSize =
                    maxSizePoint.rowData[sizeFieldId]?.value?.formatted ??
                    String(maxSizePoint.sizeValue);
                sizeRange = {
                    min: Math.min(minSizePoint.sizeValue, 0),
                    max: Math.max(maxSizePoint.sizeValue, 1),
                    formattedMin: formattedMinSize,
                    formattedMax: formattedMaxSize,
                };
            }
        } else if (regionData && regionData.length > 0 && valueFieldId) {
            // Single pass to find min/max values and their regions
            let minRegion = regionData[0];
            let maxRegion = regionData[0];
            for (const region of regionData) {
                if (region.value < minRegion.value) minRegion = region;
                if (region.value > maxRegion.value) maxRegion = region;
            }
            valueRange = {
                min: minRegion.value,
                max: maxRegion.value,
                formattedMin:
                    minRegion.rowData[valueFieldId]?.value?.formatted ??
                    String(minRegion.value),
                formattedMax:
                    maxRegion.rowData[valueFieldId]?.value?.formatted ??
                    String(maxRegion.value),
            };
        }

        // Get value field label for tooltips
        let valueFieldLabel: string | null = null;
        if (valueFieldId && itemsMap?.[valueFieldId]) {
            const valueItem = itemsMap[valueFieldId];
            if ('label' in valueItem) {
                valueFieldLabel = valueItem.label;
            } else if ('name' in valueItem) {
                valueFieldLabel = (valueItem as { name: string }).name;
            }
        }

        // Get size field label for legend
        let sizeFieldLabel: string | null = null;
        if (sizeFieldId && itemsMap?.[sizeFieldId]) {
            const sizeItem = itemsMap[sizeFieldId];
            if ('label' in sizeItem) {
                sizeFieldLabel = sizeItem.label;
            } else if ('name' in sizeItem) {
                sizeFieldLabel = (sizeItem as { name: string }).name;
            }
        }

        return {
            scatterData,
            regionData,
            isLatLong,
            locationType: locationType || MapChartType.SCATTER,
            mapType,
            geoJsonUrl: getGeoJsonUrl(mapType, customGeoJsonUrl),
            // Determine the geoJsonPropertyKey to use
            // For custom maps, use configured key directly
            // For built-in maps, validate against known property keys
            geoJsonPropertyKey: (() => {
                // For custom maps, use the configured key directly (no whitelist)
                if (mapType === MapChartLocation.CUSTOM) {
                    return configGeoJsonPropertyKey || 'name';
                }

                // Define valid keys for each built-in map type
                const usaValidKeys = ['code', 'name'];
                const worldValidKeys = [
                    'ISO3166-1-Alpha-3',
                    'ISO3166-1-Alpha-2',
                    'name',
                ];

                if (mapType === MapChartLocation.USA) {
                    if (
                        configGeoJsonPropertyKey &&
                        usaValidKeys.includes(configGeoJsonPropertyKey)
                    ) {
                        return configGeoJsonPropertyKey;
                    }
                    return 'code';
                }
                // For world/other, use configured key if valid for world, otherwise default to ISO3
                if (
                    configGeoJsonPropertyKey &&
                    worldValidKeys.includes(configGeoJsonPropertyKey)
                ) {
                    return configGeoJsonPropertyKey;
                }
                return 'ISO3166-1-Alpha-3';
            })(),
            extent,
            hasSavedExtent,
            colors: {
                primary: colorRange?.[0] || theme.colors.blue[6],
                scale: colorRange || [
                    theme.colors.blue[1],
                    theme.colors.blue[3],
                    theme.colors.blue[5],
                    theme.colors.blue[7],
                    theme.colors.blue[9],
                ],
            },
            minBubbleSize: minBubbleSize ?? 2,
            maxBubbleSize: maxBubbleSize ?? 8,
            sizeRange,
            sizeFieldLabel,
            heatmapConfig: {
                radius: heatmapConfig?.radius ?? 25,
                blur: heatmapConfig?.blur ?? 15,
                opacity: heatmapConfig?.opacity ?? 0.6,
            },
            tile: getTileConfig(tileBackground),
            backgroundColor: backgroundColor ?? null,
            noDataColor: noDataColor ?? '#f3f3f3',
            dataLayerOpacity: dataLayerOpacity ?? 0.7,
            showLegend: showLegend ?? false,
            valueRange,
            valueFieldLabel,
            locationFieldId: locationFieldId ?? null,
            tooltipFields,
        };
    }, [chartConfig, resultsData, theme, itemsMap]);
};

export default useLeafletMapConfig;
