import {
    MapChartLocation,
    MapChartType,
    MapTileBackground,
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
    value: number;
    rowData: Record<string, any>;
};

export type RegionData = {
    name: string;
    value: number;
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
    center: [number, number];
    zoom: number;
    colors: {
        primary: string;
        scale: string[];
    };
    minBubbleSize: number;
    maxBubbleSize: number;
    tile: TileConfig;
};

const getGeoJsonUrl = (
    mapType: MapChartLocation,
    customUrl?: string,
): string | null => {
    if (mapType === MapChartLocation.CUSTOM && customUrl) {
        const isExternalUrl =
            customUrl.startsWith('http://') || customUrl.startsWith('https://');
        if (isExternalUrl) {
            return `/api/v1/geojson-proxy?url=${encodeURIComponent(customUrl)}`;
        }
        return customUrl;
    }

    switch (mapType) {
        case MapChartLocation.USA:
            return '/us-states.json';
        case MapChartLocation.USA_COUNTIES:
            return '/us-counties.json';
        case MapChartLocation.EUROPE:
            return '/europe.json';
        case MapChartLocation.WORLD:
            return '/world.json';
        default:
            return '/world.json';
    }
};

const getMapCenter = (mapType: MapChartLocation): [number, number] => {
    switch (mapType) {
        case MapChartLocation.USA:
        case MapChartLocation.USA_COUNTIES:
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
        case MapChartLocation.USA_COUNTIES:
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
        case MapTileBackground.LIGHT:
            return {
                url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
        case MapTileBackground.OPENSTREETMAP:
        default:
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
    const { visualizationConfig, resultsData } = useVisualizationContext();
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
            valueFieldId,
            colorRange,
            defaultZoom,
            defaultCenterLat,
            defaultCenterLon,
            minBubbleSize,
            maxBubbleSize,
            tileBackground,
        } = chartConfig.validConfig || {};

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
                        const value = valueFieldId
                            ? Number(row[valueFieldId]?.value.raw)
                            : 1;

                        if (isNaN(lat) || isNaN(lon)) return null;

                        return {
                            lat,
                            lon,
                            value,
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

        return {
            scatterData,
            regionData,
            isLatLong,
            locationType: locationType || MapChartType.SCATTER,
            mapType,
            geoJsonUrl: getGeoJsonUrl(mapType, customGeoJsonUrl),
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
            tile: getTileConfig(tileBackground),
        };
    }, [chartConfig, resultsData, theme]);
};

export default useLeafletMapConfig;
