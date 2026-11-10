import { getRetentionPeriodLabel } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../components/EChartsReactWrapper';
import { useAppSelector } from '../store';
import { selectResults } from '../store/retentionBuilderSlice';
import { formatRetentionRate } from '../utils/retentionConfig';

const SERIES_COLORS = [
    '#6366f1',
    '#8b5cf6',
    '#ec4899',
    '#f97316',
    '#22c55e',
    '#06b6d4',
    '#ef4444',
    '#eab308',
];

const COHORT_LINE_COLOR = 'rgba(99, 102, 241, 0.18)';

/**
 * Draws the size-weighted average retention per period, one line per
 * breakdown value, with individual cohorts drawn faintly behind it.
 */
export const RetentionCurveChart: FC = () => {
    const theme = useMantineTheme();
    const results = useAppSelector(selectResults);

    const echartsOptions = useMemo(() => {
        if (!results) return {};
        const { unit, periods, averages, cohorts } = results;
        const hasBreakdown = averages.some((a) => a.breakdownValue !== null);
        const categories = Array.from({ length: periods + 1 }, (_, p) =>
            getRetentionPeriodLabel(unit, p),
        );

        const cohortSeries = hasBreakdown
            ? []
            : cohorts.map((cohort) => ({
                  name: cohort.cohortDate,
                  type: 'line' as const,
                  data: cohort.rates.map((rate, p) =>
                      p <= cohort.lastCompletePeriod ? rate : null,
                  ),
                  lineStyle: { color: COHORT_LINE_COLOR, width: 1 },
                  itemStyle: { color: COHORT_LINE_COLOR },
                  symbol: 'none',
                  silent: true,
                  tooltip: { show: false },
              }));

        const averageSeries = averages.map((average, idx) => ({
            name: average.breakdownValue ?? 'Average',
            type: 'line' as const,
            data: average.rates,
            lineStyle: {
                color: SERIES_COLORS[idx % SERIES_COLORS.length],
                width: 3,
            },
            itemStyle: { color: SERIES_COLORS[idx % SERIES_COLORS.length] },
            symbol: 'circle',
            symbolSize: 6,
            connectNulls: false,
        }));

        return {
            animation: false,
            tooltip: {
                trigger: 'axis' as const,
                valueFormatter: (value: unknown) =>
                    typeof value === 'number'
                        ? formatRetentionRate(value)
                        : '—',
            },
            legend: hasBreakdown
                ? { data: averageSeries.map((s) => s.name), top: 0 }
                : { show: false },
            xAxis: {
                type: 'category' as const,
                data: categories,
                boundaryGap: false,
                axisLabel: {
                    color: theme.colors.gray[7],
                    fontFamily: 'Inter, sans-serif',
                },
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                max: 100,
                axisLabel: {
                    formatter: '{value}%',
                    color: theme.colors.gray[7],
                    fontFamily: 'Inter, sans-serif',
                },
            },
            series: [...cohortSeries, ...averageSeries],
            grid: {
                left: 60,
                right: 20,
                top: hasBreakdown ? 40 : 20,
                bottom: 40,
            },
        };
    }, [results, theme]);

    if (!results?.cohorts.length) return null;

    return (
        <EChartsReact
            option={echartsOptions}
            notMerge={true}
            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
            style={{ width: '100%', height: '100%', minHeight: 300 }}
            opts={{ renderer: 'svg' }}
        />
    );
};
