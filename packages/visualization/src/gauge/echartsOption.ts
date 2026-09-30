import {
    formatItemValue,
    getGranularityMapFromItems,
    getItemLabelWithoutTableName,
    resolveGranularityInLabel,
    type GaugeChart,
    type GaugeSection,
} from '@lightdash/common';
import { type EChartsOption, type GaugeSeriesOption } from 'echarts';
import toNumber from 'lodash/toNumber';
import { sanitizeEchartsFontFamily } from '../fonts';
import { type VisualizationTheme } from '../theme';
import { type VisualizationContextInput } from '../types';

const EchartsGaugeType = 'gauge';

/**
 * Mantine's default `dark[6]`, the border between gauge sections in dark
 * mode. The frontend reads it from its Mantine theme (`theme.colors.dark`,
 * the app chrome ramp), which `VisualizationTheme` does not carry: it holds
 * `ldDark` as `dark`, a different ramp. Callers pass the ramp in
 * `mantineDarkColors` until the theme has a field for it.
 */
export const DEFAULT_GAUGE_SECTION_BORDER_DARK = '#1e1e21';

type Rgba = { r: number; g: number; b: number; a: number };

const isHexColor = (hex: string) =>
    /^#?([0-9A-F]{3}){1,2}([0-9A-F]{2})?$/i.test(hex);

const hexToRgba = (color: string): Rgba => {
    let hexString = color.replace('#', '');
    if (hexString.length === 3) {
        const shorthandHex = hexString.split('');
        hexString = [
            shorthandHex[0],
            shorthandHex[0],
            shorthandHex[1],
            shorthandHex[1],
            shorthandHex[2],
            shorthandHex[2],
        ].join('');
    }
    if (hexString.length === 8) {
        const alpha = parseInt(hexString.slice(6, 8), 16) / 255;
        return {
            r: parseInt(hexString.slice(0, 2), 16),
            g: parseInt(hexString.slice(2, 4), 16),
            b: parseInt(hexString.slice(4, 6), 16),
            a: alpha,
        };
    }
    return {
        r: parseInt(hexString.slice(0, 2), 16),
        g: parseInt(hexString.slice(2, 4), 16),
        b: parseInt(hexString.slice(4, 6), 16),
        a: 1,
    };
};

const rgbStringToRgba = (color: string): Rgba => {
    const [r, g, b, a] = color
        .replace(/[^0-9,./]/g, '')
        .split(/[/,]/)
        .map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
};

/**
 * Mantine's `lighten` for the hex and rgb(a) colors the theme carries:
 * mixes the color towards white by `alpha` and returns an `rgba()` string.
 */
export const lightenColor = (color: string, alpha: number): string => {
    const { r, g, b, a } = isHexColor(color)
        ? hexToRgba(color)
        : color.startsWith('rgb')
          ? rgbStringToRgba(color)
          : { r: 0, g: 0, b: 0, a: 1 };
    const light = (input: number) => Math.round(input + (255 - input) * alpha);
    return `rgba(${light(r)}, ${light(g)}, ${light(b)}, ${a})`;
};

export const getGaugeValueColor = ({
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

export type GaugeEchartsOptionInput = VisualizationContextInput & {
    /** The resolved chart config; see `resolveGaugeChartConfig`. */
    validGaugeConfig: GaugeChart | undefined;
    theme: VisualizationTheme;
    /**
     * Mantine's `dark` ramp (the app chrome in dark mode). Only index 6 is
     * read, for the border between sections in dark mode; defaults to
     * `DEFAULT_GAUGE_SECTION_BORDER_DARK`.
     */
    mantineDarkColors?: readonly string[];
    tileFontSize: number;
    detailsFontSize: number;
    lineSize: number;
    radius: number;
};

/**
 * Builds the ECharts option for a gauge, or undefined when there is nothing
 * to draw: no config, no rows, or no selected field in the items.
 */
export const buildGaugeEchartsOption = ({
    validGaugeConfig,
    itemsMap,
    resultsData,
    parameters,
    minimal,
    resolvedTimezone,
    isInDashboard,
    theme,
    mantineDarkColors,
    tileFontSize,
    detailsFontSize,
    lineSize,
    radius,
}: GaugeEchartsOptionInput): EChartsOption | undefined => {
    const colorScheme = theme.colorScheme;

    const gaugeSeries: GaugeSeriesOption[] | undefined = (() => {
        if (!validGaugeConfig || !resultsData) return undefined;

        const {
            selectedField,
            min = 0,
            max = 100,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
        } = validGaugeConfig;

        // Get the first row of data
        const rows = resultsData.rows;
        if (!rows || rows.length === 0) return undefined;

        const firstRow = rows[0];
        if (!selectedField || !firstRow) return undefined;

        const fieldItem = itemsMap?.[selectedField];
        if (!fieldItem) return undefined;

        const granularityMap = getGranularityMapFromItems(itemsMap);

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

        const rawFieldLabel =
            customLabel || getItemLabelWithoutTableName(fieldItem);
        const fieldLabel =
            resolveGranularityInLabel(rawFieldLabel, granularityMap) ??
            rawFieldLabel;

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

        const valueColor = getGaugeValueColor({
            foregroundColor: theme.foreground,
            numericValue,
            sections: sectionsWithResolvedValues,
            primaryColor: theme.blue[6],
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
            min,
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
                    color: [[1, theme.gray[2]]],
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
                color: theme.gray[9],
                fontSize: detailsFontSize / 4,
                distance:
                    lineSize *
                    (lineSize > 35 ? (lineSize > 60 ? 1 : 0.75) : 0.5),
                formatter(value): string {
                    if ([min, effectiveMax].includes(value)) {
                        return formatItemValue(
                            fieldItem,
                            value,
                            false,
                            parameters,
                            resolvedTimezone,
                        );
                    }
                    return '';
                },
            },
            title: {
                show: true,
                offsetCenter: [0, '-25%'],
                fontSize: tileFontSize,
                color: theme.gray[9],
            },
            detail: {
                valueAnimation: true,
                offsetCenter: [
                    0,
                    validGaugeConfig.showPercentage ? '0' : '-5%',
                ],
                formatter: (value): string => {
                    const showPercentage = validGaugeConfig.showPercentage;

                    const formattedValue = formatItemValue(
                        fieldItem,
                        value,
                        false,
                        parameters,
                        resolvedTimezone,
                    );

                    if (showPercentage) {
                        const percentageValue = `${(
                            ((toNumber(value) - min) / (effectiveMax - min)) *
                            100
                        ).toFixed(0)}%`;
                        const customPercentageLabel =
                            validGaugeConfig.customPercentageLabel;
                        const percentageLabel = customPercentageLabel
                            ? ` ${
                                  resolveGranularityInLabel(
                                      customPercentageLabel,
                                      granularityMap,
                                  ) ?? customPercentageLabel
                              }`
                            : '';
                        return `{value|${formattedValue}}\n{percentage|${percentageValue}}{percentageLabel|${percentageLabel}}`;
                    }
                    return `{value|${formattedValue}}`;
                },
                rich: {
                    value: {
                        fontSize: detailsFontSize,
                        lineHeight: detailsFontSize * 1.2,
                        fontWeight: 600,
                        color: valueColor.text,
                    },
                    percentageLabel: {
                        fontSize: tileFontSize * 0.8,
                        lineHeight: tileFontSize * 1.5,
                        color: theme.gray[7],
                        fontWeight: 500,
                    },
                    percentage: {
                        fontSize: tileFontSize * 0.8,
                        lineHeight: tileFontSize * 1.5,
                        color:
                            colorScheme === 'dark'
                                ? theme.gray[9]
                                : theme.gray[7],
                        fontWeight: 500,
                        backgroundColor:
                            colorScheme === 'dark'
                                ? theme.dark[4]
                                : lightenColor(theme.gray[0], 0.5),
                        borderColor: theme.gray[2],
                        borderWidth: 1,
                        borderRadius: 8,
                        padding: [4, 8],
                    },
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
                        colorScheme === 'light'
                            ? 'white'
                            : (mantineDarkColors?.[6] ??
                              DEFAULT_GAUGE_SECTION_BORDER_DARK),
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
    })();

    const eChartsOption: EChartsOption | undefined = (() => {
        if (!validGaugeConfig || !gaugeSeries) return undefined;

        return {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(theme.chartFont),
            },
            series: gaugeSeries,
            animation: !(isInDashboard || minimal),
        };
    })();

    if (!itemsMap) return undefined;
    if (!eChartsOption) return undefined;

    return eChartsOption;
};
