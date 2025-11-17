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

        const {
            selectedField,
            min,
            max,
            showProgress,
            showAxisLabels,
            sections,
        } = chartConfig.chartConfig.validConfig;

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

        const sectionColors: [number, string][] = [];
        const defaultGapColor = theme.colors.gray[3];

        if (sections && sections.length > 0) {
            const sortedSections = [...sections].sort((a, b) => a.max - b.max);
            const range = (max ?? 100) - (min ?? 0);

            let previousThreshold = 0;

            for (const section of sortedSections) {
                const normalizedThreshold = (section.max - (min ?? 0)) / range;
                // Add gap section if there's a gap between previous threshold and current section
                if (section.min > previousThreshold) {
                    const normalizedGapThreshold =
                        (section.min - (min ?? 0)) / range;
                    sectionColors.push([
                        normalizedGapThreshold,
                        defaultGapColor,
                    ]);
                }
                sectionColors.push([normalizedThreshold, section.color]);
                previousThreshold = normalizedThreshold;
            }

            // Fill any remaining gap to the end with gap color
            if (previousThreshold < 1) {
                sectionColors.push([1, defaultGapColor]);
            }
        } else {
            // If no sections defined, fill entire gauge with gap color
            sectionColors.push([1, defaultGapColor]);
        }

        return {
            type: EchartsGaugeType,
            animation: false,
            startAngle: 180,
            endAngle: 0,
            center: ['50%', '75%'],
            radius: '90%',
            min: min ?? 0,
            max: max ?? 100,
            splitNumber: 10,
            axisLine: {
                show: true,
                roundCap: false,
                lineStyle: {
                    width: 20,
                    opacity: 0.8,
                    color: sectionColors,
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
                roundCap: false,
            },
            axisTick: {
                show: false,
            },
            splitLine: {
                show: false,
            },
            axisLabel: {
                show: showAxisLabels ?? false,
                formatter: function (value) {
                    if ([min, max].includes(value)) {
                        return value;
                    }
                },
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
    }, [chartConfig, resultsData, itemsMap, theme.colors.gray]);

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
