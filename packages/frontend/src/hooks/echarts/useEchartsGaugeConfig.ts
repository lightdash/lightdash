import {
    formatItemValue,
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
    gaugeMax,
    foregroundColor,
}: {
    numericValue: number;
    sections: GaugeSection[] | undefined;
    primaryColor: string;
    gaugeMax: number;
    foregroundColor: string;
}) => {
    const defaultColours = {
        text: foregroundColor,
        bar: primaryColor,
    };
    if (!sections || sections.length === 0) {
        // Default for no sections
        return defaultColours;
    }

    // Find the section that contains this value
    const sortedSections = [...sections].sort((a, b) => a.max - b.max);

    // Check edge case where value is above max
    if (numericValue > gaugeMax) {
        const lastSection = sortedSections[sortedSections.length - 1];
        if (lastSection && lastSection.max >= gaugeMax) {
            return {
                text: lastSection.color,
                bar: lastSection.color,
            };
        }
    }

    // If value is in a section, return the section's color
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
    const { visualizationConfig, itemsMap, resultsData, parameters } =
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
            min = 0,
            max = 100,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
        } = chartConfig.validConfig;

        // Get the first row of data
        const rows = resultsData.rows;
        if (!rows || rows.length === 0) return;

        const firstRow = rows[0];
        if (!selectedField || !firstRow) return;

        const fieldItem = itemsMap?.[selectedField];
        if (!fieldItem) return;

        const rawValue = firstRow[selectedField];
        const numericValue = toNumber(rawValue?.value.raw);

        // Get dynamic max value from metric if configured
        let effectiveMax = max;
        if (maxFieldId) {
            const maxFieldValue = firstRow[maxFieldId];
            if (maxFieldValue) {
                const maxFromMetric = toNumber(maxFieldValue.value.raw);
                if (!isNaN(maxFromMetric) && maxFromMetric > 0) {
                    effectiveMax = maxFromMetric;
                }
            }
        }

        const fieldLabel =
            customLabel || getItemLabelWithoutTableName(fieldItem);

        const sectionColors: [number, string][] = [];
        const defaultGapColor = 'transparent';

        // Resolve dynamic section values from metrics
        const sectionsWithResolvedValues = sections?.map((section) => {
            let effectiveSectionMin = section.min;
            let effectiveSectionMax = section.max;

            // Get dynamic min value from metric if configured
            if (section.minFieldId) {
                const minFieldValue = firstRow[section.minFieldId];
                if (minFieldValue) {
                    const minFromMetric = toNumber(minFieldValue.value.raw);
                    if (!isNaN(minFromMetric)) {
                        effectiveSectionMin = minFromMetric;
                    }
                }
            }

            // Get dynamic max value from metric if configured
            if (section.maxFieldId) {
                const maxFieldValue = firstRow[section.maxFieldId];
                if (maxFieldValue) {
                    const maxFromMetric = toNumber(maxFieldValue.value.raw);
                    if (!isNaN(maxFromMetric) && maxFromMetric > 0) {
                        effectiveSectionMax = maxFromMetric;
                    }
                }
            }

            return {
                ...section,
                min: effectiveSectionMin,
                max: effectiveSectionMax,
            };
        });

        const valueColor = getValueColor({
            foregroundColor: theme.colors.foreground[0],
            numericValue,
            sections: sectionsWithResolvedValues,
            primaryColor: theme.colors.blue[6],
            gaugeMax: effectiveMax,
        });

        if (
            sectionsWithResolvedValues &&
            sectionsWithResolvedValues.length > 0
        ) {
            const sortedSections = [...sectionsWithResolvedValues].sort(
                (a, b) => a.max - b.max,
            );
            const range = effectiveMax - min;

            let previousThreshold = 0;

            for (const section of sortedSections) {
                if (section.min > section.max) {
                    continue; // skip invalid range
                }
                // Add gap section if there's a gap between previous threshold and current section
                if (section.min > previousThreshold) {
                    const normalizedGapThreshold =
                        Math.min(section.min - min, effectiveMax) / range;
                    sectionColors.push([
                        normalizedGapThreshold,
                        defaultGapColor,
                    ]);
                }
                const normalizedThreshold =
                    (Math.min(section.max, effectiveMax) - min) / range;
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
            min: min,
            max: effectiveMax,
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
                    color: [[1, theme.colors.ldGray[2]]],
                },
            },
            progress: {
                show: true,
                width: lineSize,
                overlap: true,
                itemStyle: {
                    color: valueColor.bar,
                },
            },
            axisLabel: {
                show: showAxisLabels ?? false,
                color: theme.colors.ldGray[9],
                fontSize: detailsFontSize / 4,
                distance:
                    lineSize *
                    (lineSize > 35 ? (lineSize > 60 ? 1 : 0.75) : 0.5),
                formatter: function (value): string {
                    if ([min, effectiveMax].includes(value)) {
                        return formatItemValue(
                            fieldItem,
                            value,
                            false,
                            parameters,
                        );
                    }
                    return '';
                },
            },
            title: {
                show: true,
                offsetCenter: [0, '-25%'],
                fontSize: tileFontSize,
                color: theme.colors.ldGray[9],
            },
            detail: {
                valueAnimation: true,
                fontSize: detailsFontSize,
                offsetCenter: [0, '-5%'],
                color: valueColor.text,
                formatter: (value): string => {
                    return formatItemValue(fieldItem, value, false, parameters);
                },
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
                    borderColor:
                        theme.colorScheme === 'light'
                            ? 'white'
                            : theme.colors.dark[6],
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
        parameters,
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
