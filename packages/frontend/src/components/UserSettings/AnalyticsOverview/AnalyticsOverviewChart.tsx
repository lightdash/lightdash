import { Paper, Skeleton, Stack, Text, useMantineTheme } from '@mantine/core';
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

const AnalyticsOverviewChart = ({
    chart,
    result,
    projectNames,
}: {
    chart: AnalyticsChartSpec;
    result: AnalyticsOverviewQueryResult;
    projectNames: Record<string, string>;
}) => {
    const theme = useMantineTheme();
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
                    ? 'Cached'
                    : 'Uncached';
            return chart.kind === 'time'
                ? String(value).slice(0, 10)
                : (analyticsCategoryLabels[dimension]?.[String(value)] ??
                      String(value));
        });
        const values = rows.map((row) => {
            const value = row[field(chart.metric)];
            return value === null || value === undefined ? null : Number(value);
        });
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
            splitLine: { show: false },
        };
        return {
            animation: false,
            aria: { enabled: true },
            grid: {
                top: 12,
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
            series: [
                {
                    type: 'bar',
                    name: chart.title,
                    data: values,
                    barMaxWidth: chart.kind === 'time' ? 18 : 22,
                    itemStyle: {
                        color: theme.colors.violet[5],
                        borderRadius: 3,
                    },
                },
            ],
        };
    }, [chart, result.data, projectNames, theme]);

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
