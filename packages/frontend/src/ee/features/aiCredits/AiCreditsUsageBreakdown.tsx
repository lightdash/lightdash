import {
    AI_CREDIT_USAGE_BREAKDOWNS,
    type AiCreditDailyUsage,
    type AiCreditUsageBreakdown,
} from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { type EChartsOption } from 'echarts';
import { useMemo, useState, type FC } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import EChartsReact from '../../../components/EChartsReactWrapper';
import classes from './AiCreditsUsageBreakdown.module.css';
import {
    getAiCreditRowShare,
    getAiCreditSeriesColor,
    toAiCreditChartBuckets,
} from './dailyUsageChart';
import { useAiCreditDailyUsage } from './hooks/useAiCreditDailyUsage';
import { getAiCreditBreakdownLabel, getAiCreditSeriesLabel } from './labels';

const creditFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
});

const CHART_HEIGHT = 200;

type LabelledSeries = {
    id: string;
    label: string;
    color: string;
    credits: number;
};

const toLabelledSeries = (usage: AiCreditDailyUsage): LabelledSeries[] =>
    usage.series.map((series, index) => ({
        id: series.type === 'value' ? `value:${series.key}` : series.type,
        label: getAiCreditSeriesLabel(usage.breakdown, series),
        color: getAiCreditSeriesColor(series, index),
        credits: series.credits,
    }));

const UsageChart: FC<{
    usage: AiCreditDailyUsage;
    series: LabelledSeries[];
}> = ({ usage, series }) => {
    const option = useMemo<EChartsOption>(() => {
        const buckets = toAiCreditChartBuckets(usage);
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
                valueFormatter: (value) =>
                    typeof value === 'number'
                        ? `${creditFormat.format(value)} credits`
                        : '',
            },
            series: series.map((item, index) => ({
                type: 'bar',
                name: item.label,
                stack: 'credits',
                barMaxWidth: 24,
                itemStyle: { color: item.color },
                data: buckets.map((bucket) => bucket.credits[index]),
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

const UsageRows: FC<{
    series: LabelledSeries[];
    allowanceCredits: number | null;
    usedCredits: number;
}> = ({ series, allowanceCredits, usedCredits }) => (
    <Stack gap="sm">
        {series.map((item) => (
            <Box key={item.id}>
                <Group justify="space-between" gap="xs" mb={4}>
                    <Group gap="xs" wrap="nowrap">
                        <Box className={classes.dot} bg={item.color} />
                        <Text fz="sm">{item.label}</Text>
                    </Group>
                    <Text fz="sm" c="dimmed">
                        {creditFormat.format(item.credits)} credits
                    </Text>
                </Group>
                <Box
                    className={classes.segments}
                    role="img"
                    aria-label={`${item.label}: ${creditFormat.format(item.credits)} credits`}
                >
                    <Box
                        className={classes.fill}
                        w={`${getAiCreditRowShare({
                            credits: item.credits,
                            allowanceCredits,
                            usedCredits,
                        })}%`}
                        bg={item.color}
                    />
                </Box>
            </Box>
        ))}
    </Stack>
);

export const AiCreditsUsageBreakdown: FC<{
    allowanceCredits: number | null;
    usedCredits: number;
}> = ({ allowanceCredits, usedCredits }) => {
    const [breakdown, setBreakdown] =
        useState<AiCreditUsageBreakdown>('feature');
    const {
        data: usage,
        isInitialLoading,
        isError,
        refetch,
    } = useAiCreditDailyUsage(breakdown);
    const series = useMemo(
        () => (usage === undefined ? [] : toLabelledSeries(usage)),
        [usage],
    );

    return (
        <Paper p="md">
            <Stack gap="md">
                <Group justify="space-between" gap="sm">
                    <Title order={5}>Usage breakdown</Title>
                    <SegmentedControl
                        size="xs"
                        value={breakdown}
                        onChange={(value) => {
                            const next = AI_CREDIT_USAGE_BREAKDOWNS.find(
                                (option) => option === value,
                            );
                            if (next !== undefined) setBreakdown(next);
                        }}
                        data={AI_CREDIT_USAGE_BREAKDOWNS.map((value) => ({
                            value,
                            label: getAiCreditBreakdownLabel(value),
                        }))}
                    />
                </Group>
                {isInitialLoading ? (
                    <EmptyStateLoader />
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
                        <UsageRows
                            series={series}
                            allowanceCredits={allowanceCredits}
                            usedCredits={usedCredits}
                        />
                    </>
                )}
            </Stack>
        </Paper>
    );
};
