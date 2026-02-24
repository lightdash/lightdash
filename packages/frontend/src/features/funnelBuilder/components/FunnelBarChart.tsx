import { friendlyName } from '@lightdash/common';
import { useMantineTheme } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../components/EChartsReactWrapper';
import { useAppSelector } from '../store';
import { selectResultsSteps } from '../store/selectors';
import {
    formatFunnelBarLabel,
    formatStepTooltipLabel,
    funnelBarLabelRichStyles,
} from '../utils/funnelChartConfig';

// Primary color for funnel bars
const PRIMARY_COLOR = '#6366f1';
const PRIMARY_COLOR_LIGHT = 'rgba(99, 102, 241, 0.15)';

// Color palette for breakdown series
const BREAKDOWN_COLORS = [
    { solid: '#6366f1', light: 'rgba(99, 102, 241, 0.15)' }, // indigo
    { solid: '#8b5cf6', light: 'rgba(139, 92, 246, 0.15)' }, // violet
    { solid: '#ec4899', light: 'rgba(236, 72, 153, 0.15)' }, // pink
    { solid: '#f97316', light: 'rgba(249, 115, 22, 0.15)' }, // orange
    { solid: '#22c55e', light: 'rgba(34, 197, 94, 0.15)' }, // green
    { solid: '#06b6d4', light: 'rgba(6, 182, 212, 0.15)' }, // cyan
    { solid: '#ef4444', light: 'rgba(239, 68, 68, 0.15)' }, // red
    { solid: '#eab308', light: 'rgba(234, 179, 8, 0.15)' }, // yellow
];

export const FunnelBarChart: FC = () => {
    const theme = useMantineTheme();
    const steps = useAppSelector(selectResultsSteps);

    const hasBreakdown = steps.some((s) => s.breakdownValue !== undefined);

    // Generate chart config
    const echartsOptions = useMemo(() => {
        if (!steps.length) return {};

        if (hasBreakdown) {
            // Get unique step names in order
            const stepNames = [...new Set(steps.map((s) => s.stepName))].sort(
                (a, b) => {
                    const stepA = steps.find((s) => s.stepName === a);
                    const stepB = steps.find((s) => s.stepName === b);
                    return (stepA?.stepOrder ?? 0) - (stepB?.stepOrder ?? 0);
                },
            );

            // Get unique breakdown values
            const breakdownValues = [
                ...new Set(
                    steps
                        .map((s) => s.breakdownValue)
                        .filter((v): v is string => v !== undefined),
                ),
            ];

            // Build a lookup map for quick access
            const stepLookup = new Map<string, (typeof steps)[0]>();
            steps.forEach((step) => {
                const key = `${step.stepName}|${step.breakdownValue}`;
                stepLookup.set(key, step);
            });

            // Create two series per breakdown: main bar + drop-off bar
            const series: Array<{
                name: string;
                type: 'bar';
                stack: string;
                data: Array<number | null>;
                itemStyle: { color: string };
                barGap?: string;
                barCategoryGap?: string;
                label?: object;
                emphasis?: object;
            }> = [];

            breakdownValues.forEach((breakdownValue, idx) => {
                const colors = BREAKDOWN_COLORS[idx % BREAKDOWN_COLORS.length];
                const stackName = `stack-${breakdownValue}`;

                // Main bar data (conversion rate)
                const mainData = stepNames.map((stepName) => {
                    const step = stepLookup.get(
                        `${stepName}|${breakdownValue}`,
                    );
                    return step?.conversionRate ?? 0;
                });

                // Drop-off bar data (previous step rate - current rate)
                const dropOffData = stepNames.map((stepName, stepIdx) => {
                    if (stepIdx === 0) return 0; // First step has no drop-off
                    const prevStepName = stepNames[stepIdx - 1];
                    const prevStep = stepLookup.get(
                        `${prevStepName}|${breakdownValue}`,
                    );
                    const currStep = stepLookup.get(
                        `${stepName}|${breakdownValue}`,
                    );
                    const prevRate = prevStep?.conversionRate ?? 0;
                    const currRate = currStep?.conversionRate ?? 0;
                    return Math.max(0, prevRate - currRate);
                });

                // Main bar series
                series.push({
                    name: breakdownValue,
                    type: 'bar',
                    stack: stackName,
                    data: mainData,
                    itemStyle: { color: colors.solid },
                    barGap: '10%',
                    barCategoryGap: '30%',
                    label: {
                        show: true,
                        position: 'inside' as const,
                        formatter: (params: { dataIndex: number }) => {
                            const step = stepLookup.get(
                                `${stepNames[params.dataIndex]}|${breakdownValue}`,
                            );
                            return step ? formatFunnelBarLabel(step) : '';
                        },
                        rich: funnelBarLabelRichStyles,
                    },
                });

                // Drop-off bar series (light color, no label)
                series.push({
                    name: `${breakdownValue}-dropoff`,
                    type: 'bar',
                    stack: stackName,
                    data: dropOffData,
                    itemStyle: { color: colors.light },
                    emphasis: { disabled: true },
                });
            });

            // Tooltip formatter for item trigger (single series)
            const tooltipFormatter = (params: {
                seriesName: string;
                dataIndex: number;
                value: number;
                marker: string;
            }) => {
                // Hide tooltip for drop-off series
                if (params.seriesName.endsWith('-dropoff')) return '';
                const stepName = stepNames[params.dataIndex];
                const step = stepLookup.get(`${stepName}|${params.seriesName}`);
                if (!step) return '';
                return `<div style="font-weight:600;margin-bottom:8px">${friendlyName(stepName)}</div><div style="color:#888;font-size:12px;margin-bottom:8px">${params.marker} ${params.seriesName}</div>${formatStepTooltipLabel(step)}`;
            };

            return {
                animation: false,
                tooltip: {
                    trigger: 'item' as const,
                    formatter: tooltipFormatter,
                },
                legend: {
                    data: breakdownValues, // Only show main series in legend
                    top: 0,
                },
                xAxis: {
                    type: 'category' as const,
                    data: stepNames.map(
                        (name, idx) => `${idx + 1} ${friendlyName(name)}`,
                    ),
                    axisLabel: {
                        interval: 0,
                        color: theme.colors.gray[7],
                        fontFamily: 'Inter, sans-serif',
                    },
                },
                yAxis: {
                    type: 'value' as const,
                    max: 100,
                    axisLabel: {
                        formatter: '{value}%',
                        color: theme.colors.gray[7],
                        fontFamily: 'Inter, sans-serif',
                    },
                },
                series,
                grid: { left: 60, right: 20, top: 50, bottom: 60 },
            };
        }

        // Simple bar chart (no breakdown) - stacked with drop-off
        const categories = steps.map((step) => step.stepName);

        // Main bar data
        const mainData = steps.map((step) => step.conversionRate);

        // Drop-off data (previous - current)
        const dropOffData = steps.map((step, idx) => {
            if (idx === 0) return 0;
            const prevRate = steps[idx - 1].conversionRate;
            return Math.max(0, prevRate - step.conversionRate);
        });

        // Tooltip formatter for item trigger (single series)
        const simpleTooltipFormatter = (params: {
            seriesName: string;
            dataIndex: number;
            marker: string;
        }) => {
            // Hide tooltip for drop-off series
            if (params.seriesName === 'Drop-off') return '';
            const step = steps[params.dataIndex];
            return `<div style="font-weight:600;margin-bottom:8px">${friendlyName(step.stepName)}</div>${formatStepTooltipLabel(step)}`;
        };

        return {
            animation: false,
            tooltip: {
                trigger: 'item' as const,
                formatter: simpleTooltipFormatter,
            },
            xAxis: {
                type: 'category' as const,
                data: categories.map(
                    (name, idx) => `${idx + 1} ${friendlyName(name)}`,
                ),
                axisLabel: {
                    interval: 0,
                    color: theme.colors.gray[7],
                    fontFamily: 'Inter, sans-serif',
                },
            },
            yAxis: {
                type: 'value' as const,
                max: 100,
                axisLabel: {
                    formatter: '{value}%',
                    color: theme.colors.gray[7],
                    fontFamily: 'Inter, sans-serif',
                },
            },
            series: [
                {
                    name: 'Conversion',
                    type: 'bar' as const,
                    stack: 'funnel',
                    data: mainData,
                    itemStyle: { color: PRIMARY_COLOR },
                    label: {
                        show: true,
                        position: 'inside' as const,
                        formatter: (params: { dataIndex: number }) => {
                            const step = steps[params.dataIndex];
                            return formatFunnelBarLabel(step);
                        },
                        rich: funnelBarLabelRichStyles,
                    },
                    barWidth: '60%',
                },
                {
                    name: 'Drop-off',
                    type: 'bar' as const,
                    stack: 'funnel',
                    data: dropOffData,
                    itemStyle: { color: PRIMARY_COLOR_LIGHT },
                    emphasis: { disabled: true },
                },
            ],
            grid: { left: 60, right: 20, top: 20, bottom: 60 },
        };
    }, [steps, theme, hasBreakdown]);

    if (!steps.length) return null;

    return (
        <EChartsReact
            option={echartsOptions}
            notMerge={true}
            style={{ width: '100%', height: '100%', minHeight: 300 }}
            opts={{ renderer: 'svg' }}
        />
    );
};
