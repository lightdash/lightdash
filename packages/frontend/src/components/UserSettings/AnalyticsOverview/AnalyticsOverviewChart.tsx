import { Paper, Skeleton, Stack, Text } from '@mantine/core';
import { type EChartsOption } from 'echarts';
import { useMemo } from 'react';
import InlineErrorState from '../../common/InlineErrorState';
import EChartsReact from '../../EChartsReactWrapper';
import classes from './AnalyticsOverview.module.css';
import {
    analyticsCategoryLabels,
    analyticsFieldId,
    type AnalyticsChartSpec,
} from './analyticsOverviewConfig';
import { type AnalyticsOverviewQueryResult } from './useAnalyticsOverviewQuery';

const colors = ['#4263EB', '#0CA678', '#7950F2', '#E67700', '#D6336C'];
const outcomeColors: Record<string, string> = {
    completed: colors[1],
    complete: colors[1],
    success: colors[1],
    failed: '#C92A2A',
    error: '#C92A2A',
    pending: colors[3],
    unknown: '#868E96',
    'Cache hit': '#12B886',
    'Cache miss': '#5C7CFA',
};

const AnalyticsOverviewChart = ({
    chart,
    result,
    projectNames,
}: {
    chart: AnalyticsChartSpec;
    result: AnalyticsOverviewQueryResult;
    projectNames: Record<string, string>;
}) => {
    const option = useMemo<EChartsOption>(() => {
        const field = (name: string) => analyticsFieldId(chart.query, name);
        const dimension = chart.query.dimensions[0];
        const rows = result.data ?? [];
        const labels = rows.map((row) => {
            const value = row[field(dimension)];
            if (value === null || value === undefined || value === '')
                return 'Not recorded';
            if (dimension === 'project_id')
                return projectNames[String(value)] ?? 'Unknown project';
            if (dimension === 'cache_hit')
                return value === true || value === 'true'
                    ? 'Cache hit'
                    : 'Cache miss';
            return chart.kind === 'time'
                ? String(value).slice(0, 10)
                : (analyticsCategoryLabels[dimension]?.[String(value)] ??
                      String(value));
        });
        const values = (metric: string) =>
            rows.map((row) => {
                const value = row[field(metric)];
                return value === null || value === undefined
                    ? null
                    : Number(value);
            });
        if (chart.kind === 'donut') {
            return {
                animation: false,
                aria: { enabled: true },
                color: colors,
                tooltip: {
                    trigger: 'item',
                    confine: true,
                    renderMode: 'richText',
                },
                legend: { type: 'scroll', bottom: 0, icon: 'roundRect' },
                series: [
                    {
                        type: 'pie',
                        name: chart.title,
                        radius: ['45%', '70%'],
                        center: ['50%', '43%'],
                        label: { show: false },
                        data: values(chart.series[0].metric).map(
                            (value, index) => ({
                                name: labels[index],
                                value: value ?? 0,
                                itemStyle: {
                                    color:
                                        outcomeColors[labels[index]] ??
                                        colors[index % colors.length],
                                },
                            }),
                        ),
                    },
                ],
            };
        }
        const ink = 'var(--mantine-color-dimmed)';
        const category = {
            type: 'category' as const,
            data: labels,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                color: ink,
                width: 130,
                overflow: 'truncate' as const,
                ...(chart.kind === 'time'
                    ? {
                          formatter: (value: string) =>
                              new Date(`${value}T00:00:00Z`).toLocaleDateString(
                                  undefined,
                                  {
                                      month: 'short',
                                      day: 'numeric',
                                      timeZone: 'UTC',
                                  },
                              ),
                      }
                    : {}),
            },
        };
        const numeric = {
            type: 'value' as const,
            minInterval: 1,
            splitNumber: 3,
            axisLabel: { color: ink, hideOverlap: true },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'var(--mantine-color-default-border)',
                    type: 'dashed' as const,
                },
            },
        };
        return {
            animation: false,
            aria: { enabled: true },
            color: colors,
            legend: {
                show: chart.series.length > 1,
                type: 'scroll',
                top: 0,
                icon: 'roundRect',
            },
            grid: {
                top: chart.series.length > 1 ? 36 : 12,
                right: 12,
                bottom: 12,
                left: 8,
                containLabel: true,
            },
            tooltip: { trigger: 'axis', confine: true, renderMode: 'richText' },
            xAxis: chart.kind === 'time' ? category : numeric,
            yAxis:
                chart.kind === 'time'
                    ? numeric
                    : { ...category, inverse: true },
            series: chart.series.map(({ metric, label }, index) => ({
                type: chart.kind === 'time' ? 'line' : 'bar',
                name: label,
                data: values(metric),
                showSymbol: true,
                symbolSize: 5,
                smooth: false,
                connectNulls: false,
                barMaxWidth: 22,
                itemStyle: { color: colors[index % colors.length] },
            })),
        };
    }, [chart, result.data, projectNames]);

    return (
        <Paper p="md" component="section" aria-label={chart.title}>
            <Stack gap="sm">
                <Text fw={500}>{chart.title}</Text>
                {result.isLoading ? (
                    <Skeleton h={240} />
                ) : result.isError ? (
                    <InlineErrorState
                        message="Unable to load this chart"
                        onRetry={() => void result.refetch()}
                    />
                ) : !result.data?.length ? (
                    <Paper variant="dotted" className={classes.emptyChart}>
                        <Text c="dimmed" fz="sm">
                            No recorded activity in this period
                        </Text>
                    </Paper>
                ) : (
                    <EChartsReact
                        className={classes.chart}
                        option={option}
                        notMerge
                        opts={{ renderer: 'svg' }}
                    />
                )}
            </Stack>
        </Paper>
    );
};

export default AnalyticsOverviewChart;
