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
import { useCallback, useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { sanitizeEchartsFontFamily } from '../../utils/sanitizeEchartsFontFamily';

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

    // Node names are opaque ids; map them to their display labels.
    const labelByName = useMemo(
        () =>
            new Map(
                (chartConfig?.data.nodes ?? []).map((node) => [
                    node.name,
                    node.label,
                ]),
            ),
        [chartConfig],
    );
    const displayName = useCallback(
        (name: string) => labelByName.get(name) ?? name,
        [labelByName],
    );

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
                formatter: (params: { name?: string }) =>
                    displayName(params.name ?? ''),
            },
        };
    }, [chartConfig, theme.colors.foreground, colorPalette, displayName]);

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
                        const source = displayName(params.data.source);
                        const target = displayName(params.data.target);
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
                        displayName(params.name),
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
        displayName,
    ]);

    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsSankeyConfig;
