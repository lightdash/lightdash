import { MapChartLocation, MapChartType } from '@lightdash/common';
import { scaleSqrt } from 'd3-scale';
import * as echarts from 'echarts';
import { type EChartsOption } from 'echarts';
import { useEffect, useMemo, useState } from 'react';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { isMapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { DEFAULT_MAP_COLORS } from '../useMapChartConfig';

type Args = {
    isInDashboard: boolean;
};

const useEchartsMapConfig = ({ isInDashboard: _isInDashboard }: Args) => {
    const { visualizationConfig, resultsData, colorPalette, itemsMap } =
        useVisualizationContext();
    const [mapsLoaded, setMapsLoaded] = useState<Set<string>>(new Set());

    const chartConfig = useMemo(() => {
        if (!isMapVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const mapType = chartConfig?.validConfig?.mapType || MapChartLocation.WORLD;
    const customGeoJsonUrl = chartConfig?.validConfig?.customGeoJsonUrl;

    console.log(
        'useEchartsMapConfig - mapType:',
        mapType,
        'customGeoJsonUrl:',
        customGeoJsonUrl,
    );

    // Generate a unique map key for custom maps
    const mapKey = useMemo(() => {
        if (mapType === MapChartLocation.CUSTOM && customGeoJsonUrl) {
            return `custom_${customGeoJsonUrl}`;
        }
        return mapType;
    }, [mapType, customGeoJsonUrl]);

    console.log('useEchartsMapConfig - mapKey:', mapKey);

    // Load and register maps
    useEffect(() => {
        const loadMap = async (type: MapChartLocation, customUrl?: string) => {
            const key = customUrl ? `custom_${customUrl}` : type;
            if (mapsLoaded.has(key)) {
                return;
            }

            let url: string;
            if (type === MapChartLocation.CUSTOM && customUrl) {
                // Use backend proxy for external URLs to bypass CORS
                // Check if the URL is external (starts with http:// or https://)
                const isExternalUrl =
                    customUrl.startsWith('http://') ||
                    customUrl.startsWith('https://');
                if (isExternalUrl) {
                    url = `/api/v1/geojson-proxy?url=${encodeURIComponent(
                        customUrl,
                    )}`;
                    console.log(
                        `Loading custom map from ${customUrl} via proxy`,
                    );
                } else {
                    // For relative paths (like /my-map.json), fetch directly
                    url = customUrl;
                    console.log(`Loading custom map from ${url}`);
                }
            } else {
                let fileName: string;
                switch (type) {
                    case MapChartLocation.USA:
                        fileName = 'us-states-albers.json';
                        break;
                    case MapChartLocation.USA_COUNTIES:
                        fileName = 'us-counties-albers.json';
                        break;
                    case MapChartLocation.EUROPE:
                        fileName = 'europe.json';
                        break;
                    case MapChartLocation.NORWAY:
                        fileName = 'norway.topojson';
                        break;
                    case MapChartLocation.BEEF_CUTS:
                        fileName = 'beef.svg';
                        break;
                    default:
                        fileName = 'world.json';
                        break;
                }
                url = `/${fileName}`;
                console.log(`Loading ${type} map from ${url}`);
            }

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // Check content type to determine how to parse the response
                const contentType = response.headers.get('content-type') || '';
                const isSvgFile =
                    contentType.includes('svg') ||
                    url.toLowerCase().endsWith('.svg');

                let mapData: { svg: string } | Record<string, unknown>;

                if (isSvgFile && !url.includes('/api/v1/geojson-proxy')) {
                    // Direct SVG file (local or CORS-enabled remote)
                    const svgString = await response.text();
                    mapData = { svg: svgString };
                    console.log(`SVG map data loaded successfully (direct)`);
                    console.log('SVG length:', svgString.length);
                } else {
                    // JSON response (GeoJSON, TopoJSON, or proxy response)
                    const data = await response.json();

                    // Check if the response contains SVG data from proxy
                    // SVG responses have shape: { __svg__: string, __isSvg__: true }
                    if (
                        typeof data === 'object' &&
                        data !== null &&
                        '__isSvg__' in data &&
                        '__svg__' in data &&
                        data.__isSvg__ === true
                    ) {
                        // SVG files are returned as { __svg__: "...", __isSvg__: true } from the proxy
                        // ECharts requires SVG to be passed as { svg: svgString }
                        const svgString = data.__svg__ as string;
                        mapData = { svg: svgString };
                        console.log(
                            `SVG map data loaded successfully (via proxy)`,
                        );
                        console.log('SVG length:', svgString.length);
                    } else if (
                        typeof data === 'object' &&
                        data !== null &&
                        (data as any).type === 'Topology' &&
                        (data as any).objects
                    ) {
                        // TopoJSON - convert to GeoJSON
                        // ECharts does NOT natively support TopoJSON, only GeoJSON
                        const topology = data as unknown as Topology;
                        const objectKeys = Object.keys(topology.objects);
                        if (objectKeys.length === 0) {
                            throw new Error(
                                'TopoJSON has no objects to convert',
                            );
                        }
                        // Use the first object in the topology
                        const firstObjectKey = objectKeys[0];
                        const geoJson = topojson.feature(
                            topology,
                            topology.objects[firstObjectKey],
                        );
                        mapData = geoJson as unknown as Record<string, unknown>;
                        console.log(
                            `TopoJSON converted to GeoJSON successfully`,
                        );
                        console.log('Object key used:', firstObjectKey);
                        console.log(
                            'Features count:',
                            (geoJson as any).features?.length,
                        );
                    } else {
                        // Regular GeoJSON
                        mapData = data as Record<string, unknown>;
                        console.log(`GeoJSON loaded successfully`);
                        console.log('GeoJSON type:', (mapData as any).type);
                        console.log(
                            'Features count:',
                            (mapData as any).features?.length,
                        );
                    }
                }

                echarts.registerMap(key, mapData as any);
                setMapsLoaded((prev) => new Set(prev).add(key));
                console.log(`Map registered successfully as "${key}"`);
            } catch (error) {
                console.error(`Failed to load map from ${url}:`, error);
                console.error(
                    'External URLs are proxied through the backend to bypass CORS restrictions',
                );
            }
        };

        // Only pass customGeoJsonUrl if the mapType is CUSTOM
        const urlToLoad =
            mapType === MapChartLocation.CUSTOM ? customGeoJsonUrl : undefined;
        console.log(
            'useEffect loadMap - mapType:',
            mapType,
            'urlToLoad:',
            urlToLoad,
        );
        void loadMap(mapType, urlToLoad);
    }, [mapType, customGeoJsonUrl, mapsLoaded]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        const isMapLoaded = mapsLoaded.has(mapKey);
        console.log(
            'useEchartsMapConfig - chartConfig:',
            !!chartConfig,
            'mapKey:',
            mapKey,
            'mapLoaded:',
            isMapLoaded,
        );
        if (!chartConfig || !isMapLoaded) return;

        const {
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
            colorRangeLow,
            colorRangeMid,
            colorRangeHigh,
        } = chartConfig.validConfig || {};

        console.log('Creating map options with fields:', {
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
        });

        // Check if we're using lat/long or region-based location
        const isLatLong =
            !locationType || locationType === MapChartType.SCATTER;

        // Transform data based on location type
        let scatterData: Array<{
            value: [number, number, number];
            itemStyle: { color: string };
            rowData?: Record<string, any>;
        }> = [];

        let regionData: Array<{ name: string; value: number }> = [];

        if (resultsData?.rows && resultsData.rows.length > 0) {
            if (isLatLong) {
                // Lat/Long scatter plot
                scatterData = resultsData.rows
                    .map((row) => {
                        if (!latitudeFieldId || !longitudeFieldId) return null;

                        const lat = Number(row[latitudeFieldId]?.value.raw);
                        const lon = Number(row[longitudeFieldId]?.value.raw);
                        const value = valueFieldId
                            ? Number(row[valueFieldId]?.value.raw)
                            : 1;

                        if (isNaN(lat) || isNaN(lon)) return null;

                        return {
                            value: [lon, lat, value] as [
                                number,
                                number,
                                number,
                            ],
                            itemStyle: {
                                color: colorPalette[0],
                            },
                            rowData: row,
                        };
                    })
                    .filter((d): d is NonNullable<typeof d> => d !== null);
            } else {
                // Region/Country choropleth map
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
                    .filter((d): d is NonNullable<typeof d> => d !== null);

                console.log('Region data for map:', regionData);
            }
        }

        console.log('loading map', mapKey);

        // Create d3 scale for scatter point sizing
        const scatterValues = scatterData.map((d) => d.value[2]);
        const sizeScale =
            scatterValues.length > 0
                ? scaleSqrt()
                      .domain([
                          Math.min(...scatterValues, 0),
                          Math.max(...scatterValues, 1),
                      ])
                      .range([3, 30])
                : () => 3;

        // Check if this is a pre-projected map (Albers) that needs identity projection
        const isPreProjected =
            mapType === MapChartLocation.USA ||
            mapType === MapChartLocation.USA_COUNTIES;
        const projection = isPreProjected
            ? {
                  project: (point: [number, number]) => point,
                  unproject: (point: [number, number]) => point,
              }
            : undefined;

        if (isLatLong) {
            // Scatter plot on map for lat/long
            return {
                toolbox: {
                    show: true,
                    orient: 'vertical',
                    left: 'right',
                    top: 'top',
                    feature: {
                        restore: {
                            show: true,
                            title: 'Reset Zoom',
                        },
                    },
                },
                geo: {
                    map: mapKey,
                    roam: true,
                    projection,
                    itemStyle: {
                        areaColor: '#f3f3f3',
                        borderColor: '#999',
                    },
                    emphasis: {
                        itemStyle: {
                            areaColor: '#e0e0e0',
                        },
                    },
                },
                series: [
                    {
                        type: 'scatter',
                        coordinateSystem: 'geo',
                        data: scatterData,
                        symbolSize: (val: number[]) => {
                            // If no value field, use small fixed size
                            if (!valueFieldId) return 4;
                            // Use d3 sqrt scale for proportional circle sizing
                            return sizeScale(val[2] as number);
                        },
                        itemStyle: {
                            color: colorPalette[0],
                            opacity: 0.5,
                            borderColor: colorPalette[0],
                            borderWidth: 2,
                        },
                        emphasis: {
                            itemStyle: {
                                borderColor: '#fff',
                                borderWidth: 1,
                            },
                        },
                    },
                ],
                tooltip: {
                    trigger: 'item',
                    formatter: (params: any) => {
                        if (params.seriesType === 'scatter') {
                            const [lon, lat, value] = params.value;
                            const rowData = params.data?.rowData;

                            let tooltipLines: string[] = [];

                            // Add value field first if present
                            if (valueFieldId && itemsMap) {
                                const valueItem = itemsMap[valueFieldId];
                                const valueLabel = valueItem
                                    ? 'label' in valueItem
                                        ? valueItem.label
                                        : 'name' in valueItem
                                        ? valueItem.name
                                        : 'Value'
                                    : 'Value';
                                tooltipLines.push(`${valueLabel}: ${value}`);
                            }

                            // Add additional fields (up to 2)
                            if (rowData && itemsMap) {
                                const usedFieldIds = new Set([
                                    latitudeFieldId,
                                    longitudeFieldId,
                                    valueFieldId,
                                ]);

                                const additionalFields = Object.keys(rowData)
                                    .filter(
                                        (fieldId) => !usedFieldIds.has(fieldId),
                                    )
                                    .slice(0, 2);

                                additionalFields.forEach((fieldId) => {
                                    const item = itemsMap[fieldId];
                                    const fieldValue =
                                        rowData[fieldId]?.value?.formatted ||
                                        rowData[fieldId]?.value?.raw;
                                    if (item && fieldValue !== undefined) {
                                        const label =
                                            'label' in item
                                                ? item.label
                                                : 'name' in item
                                                ? item.name
                                                : fieldId;
                                        tooltipLines.push(
                                            `${label}: ${fieldValue}`,
                                        );
                                    }
                                });
                            }

                            // Add lat/lon at the end, smaller and truncated
                            const latTrunc = Number(lat).toFixed(4);
                            const lonTrunc = Number(lon).toFixed(4);
                            tooltipLines.push(
                                `<span style="font-size: 0.85em; opacity: 0.7;">Lat: ${latTrunc}, Lon: ${lonTrunc}</span>`,
                            );

                            return tooltipLines.join('<br/>');
                        }
                        return params.name;
                    },
                },
            };
        } else {
            // Choropleth map for regions/countries
            return {
                toolbox: {
                    show: true,
                    orient: 'vertical',
                    left: 'right',
                    top: 'top',
                    feature: {
                        restore: {
                            show: true,
                            title: 'Reset Zoom',
                        },
                    },
                },
                tooltip: {
                    trigger: 'item',
                    formatter: (params: any) => {
                        return `${params.name}<br/>Value: ${params.value || 0}`;
                    },
                },
                visualMap: {
                    min: Math.min(...regionData.map((d) => d.value), 0),
                    max: Math.max(...regionData.map((d) => d.value), 1),
                    text: ['High', 'Low'],
                    realtime: false,
                    calculable: false,
                    inRange: {
                        color: [
                            colorRangeLow || DEFAULT_MAP_COLORS.low,
                            colorRangeMid || DEFAULT_MAP_COLORS.mid,
                            colorRangeHigh || DEFAULT_MAP_COLORS.high,
                        ],
                    },
                },
                series: [
                    {
                        type: 'map',
                        map: mapKey,
                        roam: true,
                        projection,
                        data: regionData,
                        emphasis: {
                            label: {
                                show: true,
                            },
                            itemStyle: {
                                areaColor: colorPalette[0],
                            },
                        },
                    },
                ],
            };
        }
    }, [
        chartConfig,
        resultsData,
        mapKey,
        mapsLoaded,
        colorPalette,
        mapType,
        itemsMap,
    ]);

    console.log('eChartsOption', eChartsOption);
    return eChartsOption ? { eChartsOption } : undefined;
};

export default useEchartsMapConfig;
