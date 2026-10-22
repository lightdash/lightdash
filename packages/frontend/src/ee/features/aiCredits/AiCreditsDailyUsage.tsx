import {
    type AiBillableFeature,
    type AiCreditDailyUsage,
} from '@lightdash/common';
import { Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { type EChartsOption } from 'echarts';
import { useMemo, type FC } from 'react';
import InlineErrorState from '../../../components/common/InlineErrorState';
import EChartsReact from '../../../components/EChartsReactWrapper';
import { AiCreditSeriesIcon } from './AiCreditSeriesIcon';
import { dropFutureDays, formatCredits } from './creditUsage';
import {
    findTopSeriesIndex,
    getAiCreditSeriesColor,
    renderAiCreditTooltip,
    toAiCreditChartBuckets,
} from './dailyUsageChart';
import { useAiCreditDailyUsage } from './hooks/useAiCreditDailyUsage';
import { AI_CREDIT_FEATURE_LABELS } from './labels';

const CHART_HEIGHT = 200;
const BAR_TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

type LabelledSeries = {
    feature: AiBillableFeature;
    label: string;
    color: string;
    credits: number;
};

const toLabelledSeries = (usage: AiCreditDailyUsage): LabelledSeries[] =>
    usage.series.map((series, index) => ({
        feature: series.feature,
        label: AI_CREDIT_FEATURE_LABELS[series.feature],
        color: getAiCreditSeriesColor(index),
        credits: series.credits,
    }));

const UsageChart: FC<{
    usage: AiCreditDailyUsage;
    series: LabelledSeries[];
}> = ({ usage, series }) => {
    const option = useMemo<EChartsOption>(() => {
        const buckets = toAiCreditChartBuckets({
            series: usage.series,
            days: dropFutureDays(usage.days, new Date()),
        });
        return {
            animation: false,
            grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
            xAxis: {
                type: 'category',
                data: buckets.map((bucket) => bucket.label),
                axisTick: { show: false },
                axisLine: {
                    lineStyle: { color: 'var(--mantine-color-default-border)' },
                },
                axisLabel: { color: 'var(--mantine-color-dimmed)' },
            },
            yAxis: {
                type: 'value',
                splitNumber: 3,
                axisLabel: { color: 'var(--mantine-color-dimmed)' },
                splitLine: {
                    lineStyle: { color: 'var(--mantine-color-default-border)' },
                },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'var(--mantine-color-body)',
                borderColor: 'var(--mantine-color-default-border)',
                textStyle: { color: 'var(--mantine-color-text)' },
                formatter: (params) => {
                    const points = Array.isArray(params) ? params : [params];
                    return renderAiCreditTooltip(
                        points[0] && 'axisValueLabel' in points[0]
                            ? String(points[0].axisValueLabel)
                            : '',
                        points.flatMap((point) => {
                            const item =
                                point.seriesIndex === undefined
                                    ? undefined
                                    : series[point.seriesIndex];
                            return item === undefined
                                ? []
                                : [{ ...item, credits: Number(point.value) }];
                        }),
                        formatCredits,
                    );
                },
            },
            series: series.map((item, index) => ({
                type: 'bar',
                name: item.label,
                stack: 'credits',
                barMaxWidth: 24,
                itemStyle: { color: item.color },
                // ECharts derives a hover colour by lightening this one, which fails on a CSS variable and blanks the bar.
                emphasis: { disabled: true },
                data: buckets.map((bucket) =>
                    findTopSeriesIndex(bucket.credits) === index
                        ? {
                              value: bucket.credits[index],
                              itemStyle: { borderRadius: BAR_TOP_RADIUS },
                          }
                        : bucket.credits[index],
                ),
            })),
        };
    }, [usage, series]);

    return (
        <EChartsReact
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            // The wrapper sizes the chart through an inline height.
            style={{ height: CHART_HEIGHT, width: '100%' }}
        />
    );
};

const UsageLegend: FC<{ series: LabelledSeries[] }> = ({ series }) => (
    <Group gap="md" role="list" aria-label="Credits by feature this period">
        {series.map((item) => (
            <Group key={item.feature} gap="xs" wrap="nowrap" role="listitem">
                <AiCreditSeriesIcon feature={item.feature} color={item.color} />
                <Text fz="sm">{item.label}</Text>
                <Text fz="sm" c="dimmed">
                    {formatCredits(item.credits)}
                </Text>
            </Group>
        ))}
    </Group>
);

export const AiCreditsDailyUsage: FC = () => {
    const {
        data: usage,
        isInitialLoading,
        isError,
        refetch,
    } = useAiCreditDailyUsage();
    const series = useMemo(
        () => (usage === undefined ? [] : toLabelledSeries(usage)),
        [usage],
    );

    return (
        <Paper p="md">
            <Stack gap="md">
                <Title order={5}>Daily usage by feature</Title>
                {isInitialLoading ? (
                    <Skeleton h={200} />
                ) : isError || usage === undefined ? (
                    <InlineErrorState
                        message="Daily AI credit usage could not be loaded."
                        onRetry={() => void refetch()}
                    />
                ) : series.length === 0 ? (
                    <Paper variant="dotted" p="md">
                        <Text fz="sm" c="dimmed" ta="center">
                            No usage yet this period
                        </Text>
                    </Paper>
                ) : (
                    <>
                        <UsageChart usage={usage} series={series} />
                        <UsageLegend series={series} />
                    </>
                )}
            </Stack>
        </Paper>
    );
};
