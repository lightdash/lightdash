import {
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    getTooltipStyle,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type SankeySeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { sanitizeEchartsFontFamily } from '../../utils/sanitizeEchartsFontFamily';

/** Strip " - Step N" suffix from node names for display */
const stripStepSuffix = (name: string) => name.replace(/ - Step \d+$/, '');

const useEchartsSankeyConfig = (isInDashboard?: boolean) => {
    const {
        visualizationConfig,
        colorPalette,
        parameters,
        isTouchDevice,
        minimal,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isSankeyVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const sankeySeriesOption: SankeySeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const {
            data,
            validConfig: { nodeAlign, orient },
        } = chartConfig;

        if (data.nodes.length === 0 || data.links.length === 0) return;

        // Generate levels array for per-depth coloring (per spec)
        const levels = Array.from({ length: data.maxDepth + 1 }, (_, i) => ({
            depth: i,
            itemStyle: {
                color: colorPalette[i % colorPalette.length],
            },
            lineStyle: {
                color: 'source' as const,
                opacity: 0.6,
            },
        }));

        const isVertical = (orient ?? 'horizontal') === 'vertical';

        return {
            type: 'sankey',
            layout: 'none',
            nodeAlign: nodeAlign ?? 'justify',
            orient: orient ?? 'horizontal',
            draggable: true,
            emphasis: {
                focus: 'adjacency',
            },
            top: '2%',
            bottom: isVertical ? '14%' : '2%',
            left: '1%',
            right: isVertical ? '1%' : '14%',
            nodeGap: 8,
            nodeWidth: 20,
            levels,
            data: data.nodes.map((node) => ({
                name: node.name,
            })),
            links: data.links.map((link) => ({
                source: link.source,
                target: link.target,
                value: link.value,
            })),
            lineStyle: {
                curveness: 0.5,
            },
            label: {
                show: true,
                color: theme.colors.foreground?.[0],
                position: isVertical ? 'bottom' : 'right',
                // Display clean names without step suffix
                formatter: (params: { name?: string }) =>
                    stripStepSuffix(params.name ?? ''),
            },
        };
    }, [chartConfig, theme.colors.foreground, colorPalette]);

    const eChartsOptions: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !sankeySeriesOption) return;

        // Find the metric field for tooltip formatting
        let metricField: Metric | TableCalculation | undefined;
        if (
            isSankeyVisualizationConfig(visualizationConfig) &&
            visualizationConfig.numericFields
        ) {
            const metricFieldId = chartConfig.metricFieldId;
            if (metricFieldId) {
                metricField = visualizationConfig.numericFields[metricFieldId];
            }
        }

        return {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(
                    theme?.other.chartFont as string | undefined,
                ),
            },
            tooltip: {
                ...getTooltipStyle({ appendToBody: !isTouchDevice }),
                trigger: 'item' as const,
                formatter: (params: any) => {
                    if (params.dataType === 'edge') {
                        const formattedValue = formatItemValue(
                            metricField,
                            params.value,
                            false,
                            parameters,
                            resolvedTimezone,
                        );
                        const source = stripStepSuffix(params.data.source);
                        const target = stripStepSuffix(params.data.target);
                        const colorIndicator = formatColorIndicator(
                            typeof params.color === 'string'
                                ? params.color
                                : '',
                        );
                        const valuePill = formatTooltipValue(formattedValue);
                        return formatTooltipRow(
                            colorIndicator,
                            `${source} → ${target}`,
                            valuePill,
                        );
                    }
                    const colorIndicator = formatColorIndicator(
                        typeof params.color === 'string' ? params.color : '',
                    );
                    return formatTooltipRow(
                        colorIndicator,
                        stripStepSuffix(params.name),
                        '',
                    );
                },
            },
            series: [sankeySeriesOption],
            animation: !(isInDashboard || minimal),
        };
    }, [
        chartConfig,
        sankeySeriesOption,
        isInDashboard,
        minimal,
        theme,
        isTouchDevice,
        visualizationConfig,
        parameters,
        resolvedTimezone,
    ]);

    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsSankeyConfig;
