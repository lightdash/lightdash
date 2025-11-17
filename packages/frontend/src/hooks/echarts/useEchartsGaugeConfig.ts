import {
    type GaugeSection,
    getItemLabelWithoutTableName,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type GaugeSeriesOption } from 'echarts';
import toNumber from 'lodash/toNumber';
import { useMemo } from 'react';
import { isGaugeVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

const EchartsGaugeType = 'gauge';

type Args = {
    isInDashboard: boolean;
    tileFontSize: number;
    detailsFontSize: number;
    lineSize: number;
    radius: number;
};

const getValueColor = ({
    numericValue,
    sections,
    primaryColor,
}: {
    numericValue: number;
    sections: GaugeSection[] | undefined;
    primaryColor: string;
}) => {
    const defaultColours = {
        text: 'black',
        bar: primaryColor,
    };
    if (!sections || sections.length === 0) {
        // Default for no sections
        return defaultColours;
    }

    // Find the section that contains this value
    const sortedSections = [...sections].sort((a, b) => a.max - b.max);

    for (const section of sortedSections) {
        if (numericValue >= section.min && numericValue <= section.max) {
            return {
                text: section.color,
                bar: section.color,
            };
        }
    }

    // If not in any section, it's in a gap - return black
    return defaultColours;
};

const useEchartsGaugeConfig = ({
    isInDashboard,
    tileFontSize,
    detailsFontSize,
    lineSize,
    radius,
}: Args) => {
    const { visualizationConfig, itemsMap, resultsData } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isGaugeVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const gaugeSeries: GaugeSeriesOption[] | undefined = useMemo(() => {
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
        const defaultGapColor = theme.white;

        const valueColor = getValueColor({
            numericValue,
            sections,
            primaryColor: theme.colors.blue[6],
        });

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

        const baseSeries: Partial<GaugeSeriesOption> = {
            type: EchartsGaugeType,
            animation: false,
            startAngle: 195,
            endAngle: -15,
            center: ['50%', '70%'],
            radius: `${radius}%`,
            min: min ?? 0,
            max: max ?? 100,
            splitNumber: 10,
            pointer: {
                show: false,
            },
            progress: {
                show: false,
            },
            axisTick: {
                show: false,
            },
            splitLine: {
                show: false,
            },
            axisLabel: {
                show: false,
            },
            title: {
                show: false,
            },
            detail: {
                show: false,
            },
        };

        const mainSeries: GaugeSeriesOption = {
            ...baseSeries,
            axisLine: {
                show: true,
                lineStyle: {
                    width: lineSize,
                    color: [[1, theme.colors.gray[2]]],
                },
            },
            pointer: {
                show: !showProgress ?? true,
                icon: 'triangle',
                length: -1 * (lineSize * 0.8),
                width: 10,
                offsetCenter: [0, '-100%'],
                itemStyle: {
                    color: 'black',
                },
            },
            progress: {
                show: showProgress ?? false,
                width: lineSize,
                overlap: true,
                itemStyle: {
                    color: valueColor.bar,
                },
            },
            axisLabel: {
                show: showAxisLabels ?? false,
                fontSize: detailsFontSize / 4,
                distance:
                    lineSize *
                    (lineSize > 35 ? (lineSize > 60 ? 1 : 0.75) : 0.5),
                formatter: function (value): string {
                    if ([min, max].includes(value)) {
                        return `${value}`;
                    }
                    return '';
                },
            },
            title: {
                show: true,
                offsetCenter: [0, '-25%'],
                fontSize: tileFontSize,
            },
            detail: {
                valueAnimation: true,
                fontSize: detailsFontSize,
                offsetCenter: [0, '-5%'],
                color: valueColor.text,
            },
            data: [
                {
                    value: numericValue,
                    name: fieldLabel,
                },
            ],
        };
        // Series just to show the sections above and on the outside
        const sectionWidth = Math.max(lineSize * 0.2, 8);
        const sectionSeries: GaugeSeriesOption = {
            ...baseSeries,
            zlevel: 2,
            axisLine: {
                show: true,
                lineStyle: {
                    width: sectionWidth,
                    color: sectionColors,
                },
            },
            progress: {
                show: true,
                width: sectionWidth,
                overlap: true,
                itemStyle: {
                    color: 'transparent', // we only want the border
                    borderWidth: Math.max(lineSize * 0.06, 2),
                    borderColor: 'white',
                },
            },
            data: [
                {
                    value: max, // force progress to the max
                    name: fieldLabel,
                },
            ],
        };
        return [sectionSeries, mainSeries];
    }, [
        chartConfig,
        resultsData,
        itemsMap,
        theme,
        radius,
        lineSize,
        detailsFontSize,
        tileFontSize,
    ]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !gaugeSeries) return;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            series: gaugeSeries,
            animation: !isInDashboard,
        };
    }, [chartConfig, gaugeSeries, isInDashboard, theme?.other?.chartFont]);

    if (!itemsMap) return;
    if (!eChartsOption) return;

    return { eChartsOption };
};

export default useEchartsGaugeConfig;
