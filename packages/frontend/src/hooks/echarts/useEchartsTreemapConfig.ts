import {
    formatItemValue,
    getItemLabelWithoutTableName,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type TreemapSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isTreemapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

const EchartsTreemapType = 'treemap';

const useEchartsTreemapConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap, colorPalette, parameters } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isTreemapVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const treemapSeriesOption: TreemapSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

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
            );
        };

        const getSimpleMetricDisplay = (metricId: string, value: any) => {
            return `<div><b>${getMetricDisplayName(
                metricId,
            )}: </b>${getMetricDisplayValue(metricId, value)}</div>`;
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
                borderColor:
                    theme.colors.gray[index % theme.colors.gray.length],
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
                gapWidth: 4,
            },

            upperLabel: {
                show: true,
                height: 30,
                padding: 8,
            },
            label: {
                show: true,
                formatter: '{b}',
            },
            tooltip: {
                formatter: (info) => {
                    const { name, value } = info;
                    if (!value || !Array.isArray(value) || !sizeMetricId)
                        return name;
                    const sizeMetricDisplay = getSimpleMetricDisplay(
                        sizeMetricId,
                        value[0],
                    );
                    const colorMetricDisplay =
                        colorMetricId &&
                        value.length > 1 &&
                        value[1] !== undefined
                            ? getSimpleMetricDisplay(colorMetricId, value[1])
                            : '';
                    return `<div style="font-size: 16px; font-weight: bold;">${name}</div>
                    ${sizeMetricDisplay}
                    ${colorMetricDisplay}`;
                },
            },
            color: colorMetricId === null ? colorPalette : customColors,
            colorMappingBy: colorMetricId === null ? 'index' : 'value',
            levels: [
                {
                    upperLabel: {
                        show: false,
                    },
                    color: colorMetricId === null ? colorPalette : customColors, // The global color setting doesn't work for the first level.
                    colorMappingBy: colorMetricId === null ? 'index' : 'value',
                },
                ...levels,
            ],
            data: data || [],
        };
    }, [chartConfig, theme, itemsMap, colorPalette, parameters]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !treemapSeriesOption) return;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            tooltip: {
                trigger: 'item', //Even though this is the default, tooltips will not show up if this is not set.
            },
            series: [treemapSeriesOption],
            animation: !isInDashboard,
        };
    }, [
        chartConfig,
        treemapSeriesOption,
        isInDashboard,
        theme?.other?.chartFont,
    ]);
    if (!itemsMap) return;
    if (!eChartsOption || !treemapSeriesOption) return;

    return { eChartsOption, treemapSeriesOption };
};

export default useEchartsTreemapConfig;
