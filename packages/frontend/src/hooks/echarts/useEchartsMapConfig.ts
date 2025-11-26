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

    // Generate a unique map key for custom maps
    const mapKey = useMemo(() => {
        if (mapType === MapChartLocation.CUSTOM && customGeoJsonUrl) {
            return `custom_${customGeoJsonUrl}`;
        }
        return mapType;
    }, [mapType, customGeoJsonUrl]);

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
                } else {
                    // For relative paths (like /my-map.json), fetch directly
                    url = customUrl;
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
                    default:
                        fileName = 'world.json';
                        break;
                }
                url = `/${fileName}`;
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
                        ) as GeoJSON.FeatureCollection;

                        // ECharts requires each feature to have a 'name' property for region matching
                        // If features don't have 'name', use the first property value as name
                        if (geoJson.features) {
                            geoJson.features.forEach((feature) => {
                                if (
                                    feature.properties &&
                                    !feature.properties.name
                                ) {
                                    const propKeys = Object.keys(
                                        feature.properties,
                                    );
                                    if (propKeys.length > 0) {
                                        feature.properties.name = String(
                                            feature.properties[propKeys[0]],
                                        );
                                    }
                                }
                            });
                        }
                        mapData = geoJson as unknown as Record<string, unknown>;
                    } else {
                        // Regular GeoJSON
                        // Also ensure 'name' property exists for region matching
                        const geoJson = data as GeoJSON.FeatureCollection;
                        if (geoJson.features) {
                            geoJson.features.forEach((feature) => {
                                if (
                                    feature.properties &&
                                    !feature.properties.name
                                ) {
                                    const propKeys = Object.keys(
                                        feature.properties,
                                    );
                                    if (propKeys.length > 0) {
                                        feature.properties.name = String(
                                            feature.properties[propKeys[0]],
                                        );
                                    }
                                }
                            });
                        }
                        mapData = geoJson as unknown as Record<string, unknown>;
                    }
                }

                echarts.registerMap(key, mapData as any);
                setMapsLoaded((prev) => new Set(prev).add(key));
            } catch (error) {
                console.error('Failed to load map:', key, error);
            }
        };

        // Only pass customGeoJsonUrl if the mapType is CUSTOM
        const urlToLoad =
            mapType === MapChartLocation.CUSTOM ? customGeoJsonUrl : undefined;

        void loadMap(mapType, urlToLoad);
    }, [mapType, customGeoJsonUrl, mapsLoaded]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        const isMapLoaded = mapsLoaded.has(mapKey);
        // Double-check that ECharts actually has the map registered
        // This prevents the "Cannot read properties of undefined (reading 'regions')" error
        // that can occur due to timing issues between React state updates and ECharts registration
        const isMapRegistered = echarts.getMap(mapKey) != null;
        if (!chartConfig || !isMapLoaded || !isMapRegistered) return;

        const {
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
            colorRange,
            showLegend,
            defaultZoom,
            defaultCenterLat,
            defaultCenterLon,
            minBubbleSize,
            maxBubbleSize,
        } = chartConfig.validConfig || {};

        // Check if we're using lat/long or region-based location
        const isLatLong =
            !locationType || locationType === MapChartType.SCATTER;

        // Transform data based on location type
        let scatterData: Array<{
            value: [number, number, number];
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
            }
        }

        // Create d3 scale for scatter point sizing
        const scatterValues = scatterData.map((d) => d.value[2]);
        const bubbleSizeMin = minBubbleSize ?? 5;
        const bubbleSizeMax = maxBubbleSize ?? 20;
        const sizeScale =
            scatterValues.length > 0
                ? scaleSqrt()
                      .domain([
                          Math.min(...scatterValues, 0),
                          Math.max(...scatterValues, 1),
                      ])
                      .range([bubbleSizeMin, bubbleSizeMax])
                : () => bubbleSizeMin;

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

        // Clamp zoom to valid range (1-10)
        const clampedZoom = defaultZoom
            ? Math.min(10, Math.max(1, defaultZoom))
            : undefined;

        if (isLatLong) {
            // Scatter plot on map for lat/long
            // Calculate min/max values for scatter data (reuse scatterValues from sizeScale)
            const scatterMin = Math.min(...scatterValues, 0);
            const scatterMax = Math.max(...scatterValues, 1);

            // Get value field label for legend
            const valueFieldLabel =
                valueFieldId && itemsMap?.[valueFieldId]
                    ? 'label' in itemsMap[valueFieldId]
                        ? itemsMap[valueFieldId].label
                        : 'name' in itemsMap[valueFieldId]
                        ? (itemsMap[valueFieldId] as { name: string }).name
                        : undefined
                    : undefined;

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
                visualMap: valueFieldId
                    ? (() => {
                          if (showLegend) {
                              return {
                                  type: 'continuous' as const,
                                  min: scatterMin,
                                  max: scatterMax,
                                  text: ['High', valueFieldLabel || 'Low'],
                                  realtime: false,
                                  calculable: false,
                                  orient: 'horizontal' as const,
                                  left: 'center',
                                  bottom: '5%',
                                  dimension: 2, // Use the 3rd value (index 2) which is the value
                                  seriesIndex: 0, // Target the scatter series
                                  inRange: {
                                      color: colorRange || DEFAULT_MAP_COLORS,
                                  },
                              };
                          }
                          return {
                              type: 'continuous' as const,
                              show: false,
                              min: scatterMin,
                              max: scatterMax,
                              dimension: 2,
                              seriesIndex: 0, // Target the scatter series
                              inRange: {
                                  color: colorRange || DEFAULT_MAP_COLORS,
                              },
                          };
                      })()
                    : undefined,
                geo: {
                    map: mapKey,
                    roam: true,
                    projection,
                    zoom: clampedZoom,
                    scaleLimit: {
                        min: 1,
                        max: 10,
                    },
                    center:
                        defaultCenterLon !== undefined &&
                        defaultCenterLat !== undefined
                            ? [defaultCenterLon, defaultCenterLat]
                            : undefined,
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
                            // If no value field, use min bubble size
                            if (!valueFieldId) return bubbleSizeMin;
                            // Use d3 sqrt scale for proportional circle sizing
                            return sizeScale(val[2] as number);
                        },
                        itemStyle: valueFieldId
                            ? {
                                  // Color will be set by visualMap based on value
                                  opacity: 0.7,
                                  borderWidth: 1,
                              }
                            : {
                                  // No value field - use static color
                                  color: colorPalette[0],
                                  opacity: 0.4,
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
                visualMap: (() => {
                    // Get the value field label for the legend
                    const valueFieldLabel =
                        valueFieldId && itemsMap?.[valueFieldId]
                            ? 'label' in itemsMap[valueFieldId]
                                ? itemsMap[valueFieldId].label
                                : 'name' in itemsMap[valueFieldId]
                                ? (itemsMap[valueFieldId] as { name: string })
                                      .name
                                : undefined
                            : undefined;

                    if (showLegend) {
                        return {
                            min: Math.min(...regionData.map((d) => d.value), 0),
                            max: Math.max(...regionData.map((d) => d.value), 1),
                            text: ['High', valueFieldLabel || 'Low'],
                            realtime: false,
                            calculable: false,
                            orient: 'horizontal' as const,
                            left: 'center',
                            bottom: '5%',
                            inRange: {
                                color: colorRange || DEFAULT_MAP_COLORS,
                            },
                        };
                    }
                    return {
                        show: false,
                        min: Math.min(...regionData.map((d) => d.value), 0),
                        max: Math.max(...regionData.map((d) => d.value), 1),
                        inRange: {
                            color: colorRange || DEFAULT_MAP_COLORS,
                        },
                    };
                })(),
                series: [
                    {
                        type: 'map',
                        map: mapKey,
                        roam: true,
                        projection,
                        zoom: clampedZoom,
                        scaleLimit: {
                            min: 1,
                            max: 10,
                        },
                        center:
                            defaultCenterLon !== undefined &&
                            defaultCenterLat !== undefined
                                ? [defaultCenterLon, defaultCenterLat]
                                : undefined,
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

    return eChartsOption ? { eChartsOption } : undefined;
};

// ts-unused-exports:disable-next-line
export default useEchartsMapConfig;
