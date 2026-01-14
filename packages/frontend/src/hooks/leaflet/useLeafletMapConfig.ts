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
    center: [number, number];
    zoom: number;
    colors: {
        primary: string;
        scale: string[];
    };
    minBubbleSize: number;
    maxBubbleSize: number;
    sizeRange: { min: number; max: number } | null;
    heatmapConfig: {
        radius: number;
        blur: number;
        opacity: number;
    };
    tile: TileConfig;
    backgroundColor: string | null;
    showLegend: boolean;
    valueRange: { min: number; max: number } | null;
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
            return {
                url: null,
                attribution: '',
            };
        case MapTileBackground.OPENSTREETMAP:
            return {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            };
        case MapTileBackground.DARK:
            return {
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            };
        case MapTileBackground.SATELLITE:
            return {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution:
                    'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            };
        case MapTileBackground.LIGHT:
        default:
            return {
                url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
                        const isNumeric = !isNaN(numericValue);
                        const value = isNumeric ? numericValue : null;
                        const displayValue = valueFieldId
                            ? row[valueFieldId]?.value.formatted ??
                              row[valueFieldId]?.value.raw ??
                              rawValue
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

        // Calculate center - use custom if provided, otherwise default based on map type
        const center: [number, number] =
            defaultCenterLat !== undefined && defaultCenterLon !== undefined
                ? [defaultCenterLat, defaultCenterLon]
                : getMapCenter(mapType);

        // Calculate zoom - use custom if provided, otherwise default based on map type
        const zoom = defaultZoom ?? getMapZoom(mapType);

        // Calculate value range for legend
        let valueRange: { min: number; max: number } | null = null;
        let sizeRange: { min: number; max: number } | null = null;
        if (scatterData && scatterData.length > 0) {
            // Filter out non-numeric values for range calculation
            const numericValues = scatterData
                .map((d) => d.value)
                .filter((v): v is number => v !== null);
            if (numericValues.length > 0) {
                valueRange = {
                    min: Math.min(...numericValues, 0),
                    max: Math.max(...numericValues, 1),
                };
            }
            // Calculate size range for bubble sizing
            const sizeValues = scatterData.map((d) => d.sizeValue);
            sizeRange = {
                min: Math.min(...sizeValues, 0),
                max: Math.max(...sizeValues, 1),
            };
        } else if (regionData && regionData.length > 0) {
            const values = regionData.map((d) => d.value);
            valueRange = {
                min: Math.min(...values),
                max: Math.max(...values),
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

        return {
            scatterData,
            regionData,
            isLatLong,
            locationType: locationType || MapChartType.SCATTER,
            mapType,
            geoJsonUrl: getGeoJsonUrl(mapType, customGeoJsonUrl),
            // Determine the geoJsonPropertyKey to use
            // Default to 'code' for US states, 'ISO3166-1-Alpha-3' for world
            geoJsonPropertyKey: (() => {
                // Define valid keys for each map type
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
            center,
            zoom,
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
            heatmapConfig: {
                radius: heatmapConfig?.radius ?? 25,
                blur: heatmapConfig?.blur ?? 15,
                opacity: heatmapConfig?.opacity ?? 0.6,
            },
            tile: getTileConfig(tileBackground),
            backgroundColor: backgroundColor ?? null,
            showLegend: showLegend ?? false,
            valueRange,
            valueFieldLabel,
            locationFieldId: locationFieldId ?? null,
            tooltipFields,
        };
    }, [chartConfig, resultsData, theme, itemsMap]);
};

export default useLeafletMapConfig;
