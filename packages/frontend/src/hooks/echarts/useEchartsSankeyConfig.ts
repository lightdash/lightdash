import {
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    getTooltipStyle,
    SankeyChartLabelPosition,
    SankeyChartOrientation,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

export type SankeySeriesDataPoint = {
    name: string;
    value?: number;
    itemStyle?: {
        color?: string;
    };
};

export type SankeySeriesLink = {
    source: string;
    target: string;
    value: number;
};

const useEchartsSankeyConfig = (isInDashboard?: boolean) => {
    const { visualizationConfig, parameters } = useVisualizationContext();

    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isSankeyVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const { data } = chartConfig;

        return data.nodes.length > 0 && data.links.length > 0
            ? data
            : undefined;
    }, [chartConfig]);

    const sankeySeriesOptions = useMemo(() => {
        if (!chartConfig || !seriesData) return undefined;

        const {
            validConfig: {
                nodeColorOverrides,
                nodeWidth,
                nodeGap,
                orientation,
                labels,
                linkColorMode,
                draggable,
            },
            nodeColorDefaults,
            valueField,
        } = chartConfig;

        // Build nodes with colors
        const nodes: SankeySeriesDataPoint[] = seriesData.nodes.map((node) => ({
            name: node.name,
            itemStyle: {
                color:
                    nodeColorOverrides?.[node.name] ??
                    nodeColorDefaults[node.name],
            },
        }));

        // Build links
        const links: SankeySeriesLink[] = seriesData.links.map((link) => ({
            source: link.source,
            target: link.target,
            value: link.value,
        }));

        return {
            type: 'sankey' as const,
            data: nodes,
            links,
            nodeWidth: nodeWidth ?? 20,
            nodeGap: nodeGap ?? 10,
            orient:
                orientation === SankeyChartOrientation.VERTICAL
                    ? ('vertical' as const)
                    : ('horizontal' as const),
            draggable: draggable ?? false,
            emphasis: {
                focus: 'adjacency' as const,
            },
            lineStyle: {
                color: linkColorMode ?? 'source',
                curveness: 0.5,
            },
            label: {
                show: labels?.position !== SankeyChartLabelPosition.HIDDEN,
                position:
                    labels?.position === SankeyChartLabelPosition.LEFT
                        ? ('left' as const)
                        : labels?.position === SankeyChartLabelPosition.INSIDE
                        ? ('inside' as const)
                        : ('right' as const),
                formatter: (params: Record<string, unknown>) => {
                    const name = params.name as string;
                    const value = params.value as number | undefined;
                    if (labels?.showValue && value !== undefined) {
                        const formattedValue = formatItemValue(
                            valueField,
                            value,
                            false,
                            parameters,
                        );
                        return `${name}: ${formattedValue}`;
                    }
                    return name;
                },
            },
            tooltip: {
                trigger: 'item' as const,
                triggerOn: 'mousemove' as const,
                formatter: (params: Record<string, unknown>) => {
                    const dataType = params.dataType as string | undefined;
                    const name = params.name as string;
                    const value = params.value as number | undefined;
                    const data = params.data as
                        | { source?: string; target?: string; value?: number }
                        | undefined;
                    const color = params.color as string | undefined;

                    if (dataType === 'edge' && data) {
                        // Link tooltip
                        const formattedValue = formatItemValue(
                            valueField,
                            data.value,
                            false,
                            parameters,
                        );
                        return `${data.source} → ${data.target}: ${formattedValue}`;
                    }
                    // Node tooltip
                    const formattedValue = formatItemValue(
                        valueField,
                        value,
                        false,
                        parameters,
                    );
                    const colorIndicator = formatColorIndicator(
                        typeof color === 'string' ? color : '',
                    );
                    const valuePill = formatTooltipValue(formattedValue);
                    return formatTooltipRow(colorIndicator, name, valuePill);
                },
            },
        };
    }, [chartConfig, seriesData, parameters]);

    const eChartsOptions = useMemo(() => {
        if (!chartConfig || !sankeySeriesOptions || !seriesData)
            return undefined;

        return {
            textStyle: {
                fontFamily: theme?.other.chartFont as string | undefined,
            },
            tooltip: {
                ...getTooltipStyle(),
                trigger: 'item' as const,
                triggerOn: 'mousemove' as const,
            },
            series: [sankeySeriesOptions],
            animation: !isInDashboard,
        };
    }, [chartConfig, sankeySeriesOptions, seriesData, isInDashboard, theme]);

    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsSankeyConfig;
