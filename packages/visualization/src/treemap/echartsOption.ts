import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatItemValue,
    formatTooltipHeader,
    formatTooltipValue,
    getItemLabelWithoutTableName,
    getReadableTextColor,
    getTooltipDivider,
    getTooltipStyle,
    vizThemeColors,
    type TreemapChart,
} from '@lightdash/common';
import { type EChartsOption, type TreemapSeriesOption } from 'echarts';
import { sanitizeEchartsFontFamily } from '../fonts';
import { type VisualizationTheme } from '../theme';
import { type VisualizationContextInput } from '../types';
import { type TreemapNode } from './config';

const EchartsTreemapType = 'treemap';

/**
 * The treemap config the builder reads: the frontend's editor hook result
 * and the package's `resolveTreemapChartConfig` result both fit it.
 */
export type TreemapEchartsChartConfig = {
    validConfig: Pick<TreemapChart, 'visibleMin' | 'leafDepth'>;
    sizeMetricId: string | null;
    colorMetricId: string | null;
    startColor?: string;
    endColor?: string;
    startColorThreshold?: number;
    endColorThreshold?: number;
    groupFieldIds: (string | null)[];
    data: TreemapNode[];
};

export type TreemapEchartsOptionInput = Omit<
    VisualizationContextInput,
    'resultsData'
> & {
    treemapConfig: TreemapEchartsChartConfig | undefined;
    colorPalette: string[];
    theme: VisualizationTheme;
};

/**
 * The ECharts option of a treemap, from the resolved treemap config and the
 * items of the query. `undefined` when there is nothing to draw.
 */
export const buildTreemapEchartsOption = ({
    treemapConfig: chartConfig,
    itemsMap,
    colorPalette,
    parameters,
    isTouchDevice,
    minimal,
    resolvedTimezone,
    isInDashboard,
    theme,
}: TreemapEchartsOptionInput):
    | { eChartsOption: EChartsOption; treemapSeriesOption: TreemapSeriesOption }
    | undefined => {
    const treemapSeriesOption: TreemapSeriesOption | undefined = (() => {
        if (!chartConfig) return undefined;

        const getMetricDisplayName = (metricId: string) => {
            if (!itemsMap) return metricId;
            const metricItem = itemsMap[metricId];
            if (!metricItem) return metricId;
            return getItemLabelWithoutTableName(metricItem);
        };

        const getMetricDisplayValue = (metricId: string, value: any) => {
            return formatItemValue(
                itemsMap?.[metricId],
                value,
                false,
                parameters,
                resolvedTimezone,
            );
        };

        const getStyledMetricDisplay = (
            metricId: string,
            value: any,
            color: string,
        ) => {
            const label = getMetricDisplayName(metricId);
            const formattedValue = getMetricDisplayValue(metricId, value);
            const valuePill = formatTooltipValue(formattedValue);
            const colorIndicator = formatColorIndicator(color);
            return formatCartesianTooltipRow(colorIndicator, label, valuePill);
        };

        const {
            validConfig: { visibleMin, leafDepth },
            sizeMetricId,
            colorMetricId,
            startColor,
            endColor,
            startColorThreshold,
            endColorThreshold,
            groupFieldIds,
            data,
        } = chartConfig;

        let levels = groupFieldIds?.map((fieldId, index) => ({
            itemStyle: {
                borderColor: theme.gray[index % theme.gray.length],
                borderRadius: 4,
            },
        }));
        if (levels && levels.length > 0) {
            levels = levels.slice(0, levels.length - 1);
        } else {
            levels = [];
        }
        let visualMin = undefined;
        let visualMax = undefined;
        if (
            Number.isFinite(startColorThreshold) &&
            Number.isFinite(endColorThreshold)
        ) {
            visualMin = startColorThreshold;
            visualMax = endColorThreshold;
        }

        const customColors =
            startColor && endColor ? [startColor, endColor] : undefined;

        return {
            name: 'All',
            type: EchartsTreemapType,
            visibleMin,
            leafDepth: leafDepth ? leafDepth : undefined,
            visualDimension: 1,
            visualMin,
            visualMax,
            itemStyle: {
                borderColor: 'transparent',
                gapWidth: 4,
                borderRadius: 4,
            },
            upperLabel: {
                show: true,
                height: 30,
                formatter: '{b}',
                padding: [4, 8],
                color: vizThemeColors.GRAY_9,
            },
            label: {
                show: true,
                formatter: (params) => {
                    const { name, color } = params;
                    // Get adaptive text color based on background
                    const textColor =
                        typeof color === 'string'
                            ? getReadableTextColor(color)
                            : 'white';
                    return `{${textColor}|${name}}`;
                },
                rich: {
                    white: {
                        color: 'white',
                    },
                    black: {
                        color: 'black',
                    },
                },
            },
            tooltip: {
                formatter: (info) => {
                    const { name, value, color } = info;
                    if (!value || !Array.isArray(value) || !sizeMetricId)
                        return formatTooltipHeader(name);

                    const segmentColor =
                        typeof color === 'string' ? color : theme.gray[6];
                    const header = formatTooltipHeader(name);
                    const divider = getTooltipDivider();
                    const sizeMetricDisplay = getStyledMetricDisplay(
                        sizeMetricId,
                        value[0],
                        segmentColor,
                    );
                    const colorMetricDisplay =
                        colorMetricId &&
                        value.length > 1 &&
                        value[1] !== undefined
                            ? getStyledMetricDisplay(
                                  colorMetricId,
                                  value[1],
                                  segmentColor,
                              )
                            : '';

                    return `${header}${divider}${sizeMetricDisplay}${colorMetricDisplay}`;
                },
            },
            color: colorMetricId === null ? colorPalette : customColors,
            colorMappingBy: colorMetricId === null ? 'index' : 'value',
            levels: [
                {
                    upperLabel: {
                        show: false,
                    },
                    itemStyle: {
                        borderRadius: 4,
                    },
                    color: colorMetricId === null ? colorPalette : customColors, // The global color setting doesn't work for the first level.
                    colorMappingBy: colorMetricId === null ? 'index' : 'value',
                },
                ...levels,
            ],
            data: data || [],
        };
    })();

    const eChartsOption: EChartsOption | undefined = (() => {
        if (!chartConfig || !treemapSeriesOption) return undefined;

        const animation = !(isInDashboard || minimal);

        return {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(theme.chartFont),
            },
            tooltip: {
                ...getTooltipStyle({ appendToBody: !isTouchDevice }),
                trigger: 'item' as const, //Even though this is the default, tooltips will not show up if this is not set.
            },
            // The treemap series runs its own animation and ignores the root flag.
            series: [{ ...treemapSeriesOption, animation }],
            animation,
        };
    })();
    if (!itemsMap) return undefined;
    if (!eChartsOption || !treemapSeriesOption) return undefined;
    if (!treemapSeriesOption.data || treemapSeriesOption.data.length === 0)
        return undefined;

    return { eChartsOption, treemapSeriesOption };
};

export type TreemapEchartsOption = NonNullable<
    ReturnType<typeof buildTreemapEchartsOption>
>;
