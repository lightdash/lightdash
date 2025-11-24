import { MapChartMapType } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import * as echarts from 'echarts';
import { type EChartsOption } from 'echarts';
import { useEffect, useMemo, useState } from 'react';
import { isMapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

type Args = {
    isInDashboard: boolean;
};

const useEchartsMapConfig = ({ isInDashboard: _isInDashboard }: Args) => {
    const { visualizationConfig, resultsData } = useVisualizationContext();
    const theme = useMantineTheme();
    const [mapsLoaded, setMapsLoaded] = useState<Set<string>>(new Set());

    const chartConfig = useMemo(() => {
        if (!isMapVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const mapType = chartConfig?.validConfig?.mapType || MapChartMapType.WORLD;

    // Load and register maps
    useEffect(() => {
        const loadMap = async (type: MapChartMapType) => {
            if (mapsLoaded.has(type)) return;

            let fileName: string;
            switch (type) {
                case MapChartMapType.USA:
                    fileName = 'USA.json';
                    break;
                case MapChartMapType.EUROPE:
                    fileName = 'europe.json';
                    break;
                case MapChartMapType.UK:
                    fileName = 'uk.json';
                    break;
                case MapChartMapType.NORWAY:
                    fileName = 'norway.json';
                    break;
                default:
                    fileName = 'world.json';
                    break;
            }
            console.log(`Loading ${type} map from /${fileName}`);

            try {
                const response = await fetch(`/${fileName}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const geoJson = await response.json();
                console.log(`${type} map data loaded successfully`);
                console.log('GeoJSON type:', geoJson.type);
                console.log('Features count:', geoJson.features?.length);

                echarts.registerMap(type, geoJson);
                setMapsLoaded((prev) => new Set(prev).add(type));
                console.log(`Map registered successfully as "${type}"`);
            } catch (error) {
                console.error(`Failed to load ${type} map:`, error);
            }
        };

        void loadMap(mapType);
    }, [mapType, mapsLoaded]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        const isMapLoaded = mapsLoaded.has(mapType);
        console.log(
            'useEchartsMapConfig - chartConfig:',
            !!chartConfig,
            'mapType:',
            mapType,
            'mapLoaded:',
            isMapLoaded,
        );
        if (!chartConfig || !isMapLoaded) return;

        const { latitudeFieldId, longitudeFieldId, valueFieldId, showLegend } =
            chartConfig.validConfig || {};

        console.log('Creating map options with fields:', {
            latitudeFieldId,
            longitudeFieldId,
            valueFieldId,
        });

        // Transform data to scatter plot format if we have data
        let data: Array<{
            value: [number, number, number];
            itemStyle: { color: string };
        }> = [];

        if (resultsData?.rows && resultsData.rows.length > 0) {
            data = resultsData.rows
                .map((row) => {
                    if (!latitudeFieldId || !longitudeFieldId) return null;

                    const lat = Number(row[latitudeFieldId]?.value.raw);
                    const lon = Number(row[longitudeFieldId]?.value.raw);
                    const value = valueFieldId
                        ? Number(row[valueFieldId]?.value.raw)
                        : 1;

                    if (isNaN(lat) || isNaN(lon)) return null;

                    return {
                        value: [lon, lat, value] as [number, number, number],
                        itemStyle: {
                            color: theme.colors.blue[6],
                        },
                    };
                })
                .filter((d): d is NonNullable<typeof d> => d !== null);
        }

        return {
            geo: {
                map: mapType,
                roam: true,
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
                    data,
                    symbolSize: (val: number[]) => {
                        // Scale point size based on value
                        return Math.max(
                            4,
                            Math.min(20, (val[2] as number) / 10),
                        );
                    },
                    itemStyle: {
                        color: theme.colors.blue[6],
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.3)',
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
                        return `Lat: ${lat}<br/>Lon: ${lon}<br/>Value: ${value}`;
                    }
                    return params.name;
                },
            },
            legend: showLegend
                ? {
                      show: true,
                      orient: 'vertical',
                      left: 'left',
                  }
                : { show: false },
        };
    }, [chartConfig, resultsData, mapType, mapsLoaded, theme]);

    console.log('eChartsOption', eChartsOption);
    return eChartsOption ? { eChartsOption } : undefined;
};

export default useEchartsMapConfig;
