import {
    formatItemValue,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
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
        if (!chartConfig) return;

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
                formatter: ({ marker, name, value, percent }) => {
                    const formattedValue = formatItemValue(
                        selectedField,
                        value,
                    );

                    return `${marker} <b>${name}</b><br />${percent}% - ${formattedValue}`;
                },
            },
        };
    }, [chartConfig, colorPalette, seriesData]);

    const eChartsOptions: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !funnelSeriesOptions) return;

        const {
            validConfig: {},
        } = chartConfig;

        return {
            tooltip: {
                trigger: 'item',
            },
            series: [funnelSeriesOptions],
            animation: !isInDashboard,
        };
    }, [chartConfig, isInDashboard, funnelSeriesOptions]);

    if (!itemsMap) return;
    if (!eChartsOptions) return;

    // console.log({ eChartsOptions });

    return eChartsOptions;
};

export default useEchartsFunnelConfig;
