import {
    formatItemValue,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
import { round } from 'lodash';
import { useMemo } from 'react';
import { isFunnelVisualizationConfig } from '../../components/LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

export type FunnelSeriesDataPoint = NonNullable<
    FunnelSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const useEchartsFunnelConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap, colorPalette } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isFunnelVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const {
            data,
            validConfig: {},
        } = chartConfig;

        return data;
    }, [chartConfig]);

    const funnelSeriesOptions: FunnelSeriesOption | undefined = useMemo(() => {
        if (!chartConfig || !seriesData) return;

        const {
            validConfig: {},
            selectedField,
        } = chartConfig;

        return {
            type: 'funnel',
            data: seriesData,
            color: colorPalette,
            tooltip: {
                trigger: 'item',
                formatter: ({ marker, name, value }) => {
                    const formattedValue = formatItemValue(
                        selectedField,
                        value,
                    );

                    const percentOfMax = round(
                        (Number(value) / chartConfig.maxValue) * 100,
                        2,
                    );

                    return `${marker}<b>${name}</b><br /> Value: ${formattedValue} <br/> Percent of start: ${percentOfMax}%`;
                },
            },
            label: {
                show: true,
                position: 'inside',
            },
            emphasis: {
                label: {
                    fontSize: 18,
                },
            },
        };
    }, [chartConfig, colorPalette, seriesData]);

    const eChartsOptions: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !funnelSeriesOptions || !seriesData) return;

        const {
            validConfig: {},
        } = chartConfig;

        return {
            tooltip: {
                trigger: 'item',
            },
            series: [funnelSeriesOptions],
            animation: !isInDashboard,
            legend: { data: seriesData.map(({ name }) => name) },
        };
    }, [chartConfig, funnelSeriesOptions, seriesData, isInDashboard]);

    if (!itemsMap) return;
    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsFunnelConfig;
