import { getItemLabelWithoutTableName } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type GaugeSeriesOption } from 'echarts';
import toNumber from 'lodash/toNumber';
import { useMemo } from 'react';
import { isGaugeVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

const EchartsGaugeType = 'gauge';

const useEchartsGaugeConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap, resultsData } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isGaugeVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const gaugeSeriesOption: GaugeSeriesOption | undefined = useMemo(() => {
        if (!chartConfig || !resultsData) return;

        const { selectedField, min, max, showProgress, isRadial } =
            chartConfig.chartConfig.validConfig;

        // Get the first row of data
        const rows = resultsData.rows;
        if (!rows || rows.length === 0) return;

        const firstRow = rows[0];
        if (!selectedField || !firstRow) return;

        const fieldItem = itemsMap?.[selectedField];
        if (!fieldItem) return;

        const rawValue = firstRow[selectedField];
        const numericValue = toNumber(rawValue?.value.raw);

        const fieldLabel = getItemLabelWithoutTableName(fieldItem);

        return {
            type: EchartsGaugeType,
            animation: false,
            startAngle: 180,
            endAngle: isRadial ? -180 : 0,
            center: isRadial ? ['50%', '50%'] : ['50%', '75%'],
            radius: isRadial ? '75%' : '90%',
            min: min ?? 0,
            max: max ?? 100,
            splitNumber: 10,
            axisLine: {
                show: true,
                roundCap: true,
                lineStyle: {
                    width: 20,
                },
            },
            pointer: {
                show: !showProgress ?? true,
                icon: 'triangle',
                length: '-20px',
                width: 8,
                offsetCenter: [0, '-100%'],
                itemStyle: {
                    color: 'black',
                },
            },
            progress: {
                show: showProgress ?? false,
                overlap: false,
                roundCap: true,
            },
            axisTick: {
                show: true,
            },
            splitLine: {
                show: true,
            },
            axisLabel: {
                show: true,
                distance: 30,
            },
            title: {
                show: false,
            },
            detail: {
                valueAnimation: true,
                offsetCenter: [0, 0],
            },
            data: [
                {
                    value: numericValue,
                    name: fieldLabel,
                },
            ],
        };
    }, [chartConfig, resultsData, itemsMap]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !gaugeSeriesOption) return;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            series: [gaugeSeriesOption],
            animation: !isInDashboard,
        };
    }, [
        chartConfig,
        gaugeSeriesOption,
        isInDashboard,
        theme?.other?.chartFont,
    ]);

    if (!itemsMap) return;
    if (!eChartsOption || !gaugeSeriesOption) return;

    return { eChartsOption, gaugeSeriesOption };
};

export default useEchartsGaugeConfig;
