import {
    formatItemValue,
    getItemLabelWithoutTableName,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

type SankeyNode = {
    name: string;
    itemStyle?: { color?: string };
    label?: { show?: boolean };
};

type SankeyLink = {
    source: string;
    target: string;
    value: number;
};

type Args = {
    isInDashboard: boolean;
};

const useEchartsSankeyConfig = ({ isInDashboard }: Args) => {
    const { visualizationConfig, itemsMap, resultsData, parameters } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isSankeyVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !resultsData || !itemsMap) return;

        const {
            sourceFieldId,
            targetFieldId,
            valueFieldId,
            orientation,
            nodeAlign,
            nodeGap,
            nodeWidth,
            showLabels,
            labelOverrides,
            colorOverrides,
        } = chartConfig.validConfig;

        // Validate required fields
        if (!sourceFieldId || !targetFieldId || !valueFieldId) {
            return undefined;
        }

        const rows = resultsData.rows;
        if (!rows || rows.length === 0) return undefined;

        // Extract unique nodes and build links
        const nodeSet = new Set<string>();
        const links: SankeyLink[] = [];

        for (const row of rows) {
            const sourceValue = row[sourceFieldId];
            const targetValue = row[targetFieldId];
            const weightValue = row[valueFieldId];

            if (!sourceValue || !targetValue || !weightValue) continue;

            const source = String(sourceValue.value.raw);
            const target = String(targetValue.value.raw);
            const value = Number(weightValue.value.raw);

            // Skip invalid data
            if (!source || !target || isNaN(value) || value <= 0) continue;

            // Skip self-loops (source === target)
            if (source === target) continue;

            nodeSet.add(source);
            nodeSet.add(target);

            // Aggregate duplicate links
            const existingLink = links.find(
                (l) => l.source === source && l.target === target,
            );
            if (existingLink) {
                existingLink.value += value;
            } else {
                links.push({ source, target, value });
            }
        }

        // Build nodes array with styling
        const nodes: SankeyNode[] = Array.from(nodeSet).map((nodeName) => ({
            name: labelOverrides?.[nodeName] || nodeName,
            itemStyle: colorOverrides?.[nodeName]
                ? { color: colorOverrides[nodeName] }
                : undefined,
            label: { show: showLabels },
        }));

        // Get field items for tooltip formatting
        const valueField = itemsMap[valueFieldId];

        const valueLabel = valueField
            ? getItemLabelWithoutTableName(valueField)
            : 'Value';

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            tooltip: {
                trigger: 'item',
                formatter: function (params: any) {
                    if (params.dataType === 'edge') {
                        const formattedValue = valueField
                            ? formatItemValue(
                                  valueField,
                                  params.value,
                                  false,
                                  parameters,
                              )
                            : params.value;
                        return `${params.data.source} → ${params.data.target}<br/>${valueLabel}: ${formattedValue}`;
                    }
                    return params.name;
                },
            },
            series: [
                {
                    type: 'sankey',
                    data: nodes,
                    links: links,
                    orient: orientation,
                    nodeAlign: nodeAlign,
                    nodeGap: nodeGap,
                    nodeWidth: nodeWidth,
                    emphasis: {
                        focus: 'adjacency',
                    },
                    lineStyle: {
                        color: 'gradient',
                        curveness: 0.5,
                    },
                    label: {
                        show: showLabels,
                        color: theme.colors.foreground[0],
                    },
                },
            ],
            animation: !isInDashboard,
        };
    }, [chartConfig, resultsData, itemsMap, theme, isInDashboard, parameters]);

    if (!itemsMap) return;
    if (!eChartsOption) return;

    return { eChartsOption };
};

export default useEchartsSankeyConfig;
