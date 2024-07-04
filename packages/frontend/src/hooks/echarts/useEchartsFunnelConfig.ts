import {
    formatItemValue,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
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
    value: number;
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
            validConfig: {
                labelOverrides,
                colorOverrides,
                showLegend,
                legendPosition,
            },
            selectedField,
            labels,
            colorDefaults,
        } = chartConfig;

        return {
            type: 'funnel',
            data: seriesData.map(({ name, value, meta }) => {
                return {
                    name: labelOverrides?.[name] ?? name,
                    value,
                    meta,
                    itemStyle: {
                        color: colorOverrides?.[name] ?? colorDefaults[name],
                    },
                };
            }),
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
            top:
                legendPosition === FunnelChartLegendPosition.HORIZONTAL &&
                showLegend
                    ? 50
                    : 20,
            label: {
                show: labels?.position !== FunnelChartLabelPosition.HIDDEN,
                position:
                    labels?.position &&
                    labels.position !== FunnelChartLabelPosition.HIDDEN
                        ? labels.position
                        : FunnelChartLabelPosition.INSIDE,
                color:
                    labels?.position !== FunnelChartLabelPosition.INSIDE
                        ? 'black'
                        : undefined,
                formatter: ({ name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue: chartConfig.maxValue,
                        });

                    const percentString = labels?.showPercentage
                        ? `${percentOfMax}%`
                        : '';
                    const valueString = labels?.showValue ? formattedValue : '';
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
            validConfig: { showLegend, legendPosition },
        } = chartConfig;

        return {
            tooltip: {
                trigger: 'item',
            },
            series: [funnelSeriesOptions],
            animation: !isInDashboard,
            legend: {
                show: showLegend,
                orient: legendPosition,
                type: 'scroll',
                ...(legendPosition === FunnelChartLegendPosition.VERTICAL
                    ? {
                          left: 'left',
                          top: 'middle',
                          align: 'left',
                      }
                    : {
                          left: 'center',
                          top: 'top',
                          align: 'auto',
                      }),
            },
        };
    }, [chartConfig, funnelSeriesOptions, seriesData, isInDashboard]);

    if (!itemsMap) return;
    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsFunnelConfig;
