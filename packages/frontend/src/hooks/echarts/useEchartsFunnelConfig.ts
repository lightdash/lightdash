import {
    formatItemValue,
    FunnelChartLabelPosition,
    type Metric,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
import { round } from 'lodash';
import { useMemo } from 'react';
import { isFunnelVisualizationConfig } from '../../components/LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';

export type FunnelSeriesDataPoint = NonNullable<
    FunnelSeriesOption['data']
>[number] & {
    name: string;
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const getValueAndPercentage = ({
    field,
    value,
    maxValue,
}: {
    field?: TableCalculation | Metric;
    value: any;
    maxValue: number;
}) => {
    const formattedValue = formatItemValue(field, value);

    const percentOfMax = round((Number(value) / maxValue) * 100, 2);
    return { formattedValue, percentOfMax };
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

        return data.length > 0 ? data : undefined;
    }, [chartConfig]);

    const funnelSeriesOptions: FunnelSeriesOption | undefined = useMemo(() => {
        if (!chartConfig || !seriesData) return;

        const {
            validConfig: {},
            selectedField,
            label,
        } = chartConfig;

        return {
            type: 'funnel',
            data: seriesData,
            color: colorPalette,
            tooltip: {
                trigger: 'item',
                formatter: ({ marker, name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue: chartConfig.maxValue,
                        });

                    return `${marker}<b>${name}</b><br /> Value: ${formattedValue} <br/> Percent: ${percentOfMax}%`;
                },
            },
            label: {
                show: true,
                position: label?.position || FunnelChartLabelPosition.INSIDE,
                color:
                    label?.position !== FunnelChartLabelPosition.INSIDE
                        ? 'black'
                        : undefined,
                formatter: ({ name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue: chartConfig.maxValue,
                        });

                    const percentString = label?.showPercentage
                        ? `${percentOfMax}%`
                        : '';
                    const valueString = label?.showValue ? formattedValue : '';
                    const numbersString = `${
                        valueString || percentString ? ':' : ''
                    } ${[percentString, valueString]
                        .filter(Boolean)
                        .join(' - ')}`;

                    return `${name}${numbersString}`;
                },
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
