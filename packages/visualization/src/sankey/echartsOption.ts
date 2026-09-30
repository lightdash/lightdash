import {
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    getTooltipStyle,
    type Metric,
    type SankeyChart,
    type TableCalculation,
} from '@lightdash/common';
import { type EChartsOption, type SankeySeriesOption } from 'echarts';
import { sanitizeEchartsFontFamily } from '../fonts';
import { type VisualizationTheme } from '../theme';
import { type VisualizationContextInput } from '../types';
import { type SankeySeriesDataPoint } from './transform';

export type SankeyEchartsOptionInput = VisualizationContextInput & {
    /** The resolved chart config; see `resolveSankeyChartConfig`. */
    validSankeyConfig: SankeyChart | undefined;
    /** The nodes and links; see `resolveSankeyChartConfig` and `getSankeyData`. */
    data: SankeySeriesDataPoint | undefined;
    /** The numeric fields the link value can come from, for tooltip formatting. */
    numericFields?: Record<string, Metric | TableCalculation>;
    colorPalette: string[];
    theme: VisualizationTheme;
};

/**
 * Builds the ECharts option for a sankey chart, or undefined when there is
 * nothing to draw: no config, or no nodes or links.
 */
export const buildSankeyEchartsOption = ({
    validSankeyConfig,
    data,
    numericFields,
    colorPalette,
    parameters,
    isTouchDevice,
    minimal,
    resolvedTimezone,
    theme,
    isInDashboard,
}: SankeyEchartsOptionInput): EChartsOption | undefined => {
    if (!validSankeyConfig || !data) return undefined;

    // Node names are opaque ids; map them to their display labels.
    const labelByName = new Map(
        data.nodes.map((node) => [node.name, node.label]),
    );
    const displayName = (name: string) => labelByName.get(name) ?? name;

    const sankeySeriesOption: SankeySeriesOption | undefined = (() => {
        const { nodeAlign, orient } = validSankeyConfig;

        if (data.nodes.length === 0 || data.links.length === 0)
            return undefined;

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
                color: theme.foreground,
                position: isVertical ? 'bottom' : 'right',
                formatter: (params: { name?: string }) =>
                    displayName(params.name ?? ''),
            },
        };
    })();

    if (!sankeySeriesOption) return undefined;

    // Find the metric field for tooltip formatting
    let metricField: Metric | TableCalculation | undefined;
    if (numericFields) {
        const metricFieldId = validSankeyConfig.metricFieldId;
        if (metricFieldId) {
            metricField = numericFields[metricFieldId];
        }
    }

    return {
        textStyle: {
            fontFamily: sanitizeEchartsFontFamily(theme.chartFont),
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
                        typeof params.color === 'string' ? params.color : '',
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
};
