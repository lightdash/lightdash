import {
    formatItemValue,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isFunnelVisualizationConfig } from '../../components/LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

export type PieSeriesDataPoint = NonNullable<
    FunnelSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const useEchartsFunnelConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isFunnelVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const {
            selectedMetric,
            // data, // TODO
            validConfig: {},
        } = chartConfig;

        if (!selectedMetric) return;

        // TODO
        return [
            { value: 60, name: 'Visit' },
            { value: 40, name: 'Inquiry' },
            { value: 20, name: 'Order' },
            { value: 80, name: 'Click' },
            { value: 100, name: 'Show' },
        ];
    }, [chartConfig]);

    const funnelSeriesOption: FunnelSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const {
            validConfig: {},
            selectedMetric,
        } = chartConfig;

        return {
            type: 'funnel',
            data: seriesData,
            tooltip: {
                trigger: 'item',
                formatter: ({ marker, name, value, percent }) => {
                    const formattedValue = formatItemValue(
                        selectedMetric,
                        value,
                    );

                    return `${marker} <b>${name}</b><br />${percent}% - ${formattedValue}`;
                },
            },
        };
    }, [chartConfig, seriesData]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !funnelSeriesOption) return;

        const {
            validConfig: {},
        } = chartConfig;

        return {
            tooltip: {
                trigger: 'item',
            },
            series: [funnelSeriesOption],
            animation: !isInDashboard,
        };
    }, [chartConfig, isInDashboard, funnelSeriesOption]);

    if (!itemsMap) return;
    if (!eChartsOption || !funnelSeriesOption) return;

    return { eChartsOption, funnelSeriesOption };
};

export default useEchartsFunnelConfig;
