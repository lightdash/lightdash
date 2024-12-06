import {
    assertUnreachable,
    getFieldIdForDateDimension,
    getItemId,
    getMetricExplorerDataPoints,
    getMetricExplorerDataPointsWithCompare,
    isDimension,
    MetricExplorerComparison,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import { Button, Group, Stack, Text, useMantineTheme } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import { scaleTime } from 'd3-scale';
import {
    timeDay,
    timeHour,
    timeMinute,
    timeMonth,
    timeSecond,
    timeWeek,
    timeYear,
} from 'd3-time';
import dayjs from 'dayjs';
import { useEffect, useMemo, type FC } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import MantineIcon from '../../../../components/common/MantineIcon';
import { MetricPeekDatePicker } from '../MetricPeekDatePicker';
import { MetricsVisualizationEmptyState } from '../MetricsVisualizationEmptyState';
import { FORMATS } from './types';
import { useChartZoom } from './useChartZoom';

const tickFormatter = (date: Date) => {
    return (
        timeSecond(date) < date
            ? FORMATS.millisecond
            : timeMinute(date) < date
            ? FORMATS.second
            : timeHour(date) < date
            ? FORMATS.minute
            : timeDay(date) < date
            ? FORMATS.hour
            : timeMonth(date) < date
            ? timeWeek(date) < date
                ? FORMATS.day
                : FORMATS.week
            : timeYear(date) < date
            ? FORMATS.month
            : FORMATS.year
    )(date);
};

type Props = {
    results: MetricsExplorerQueryResults | undefined;
    dateRange: MetricExplorerDateRange | undefined;
    comparison: MetricExplorerComparisonType;
    onDateRangeChange: (range: MetricExplorerDateRange) => void;
    showTimeDimensionIntervalPicker: boolean;
    timeDimensionBaseField: TimeDimensionConfig;
    setTimeDimensionOverride: (config: TimeDimensionConfig | undefined) => void;
    onTimeIntervalChange: (interval: TimeFrames) => void;
    isFetching: boolean;
};

const MetricsVisualization: FC<Props> = ({
    results,
    dateRange,
    comparison,
    onDateRangeChange,
    showTimeDimensionIntervalPicker,
    timeDimensionBaseField,
    setTimeDimensionOverride,
    onTimeIntervalChange,
    isFetching,
}) => {
    const { colors, radius, shadows, fontSizes } = useMantineTheme();

    const dataPoints = useMemo(() => {
        if (isFetching) return null;
        if (!results.rows) return null;

        const timeDimension = results.metric.timeDimension;
        if (!timeDimension) return null;

        const dimensionId = getFieldIdForDateDimension(
            getItemId({
                name: timeDimension.field,
                table: timeDimension.table,
            }),
            timeDimension.interval,
        );

        const dimension = results.fields[dimensionId];
        if (!dimension || !isDimension(dimension)) return null;

        switch (comparison.type) {
            case MetricExplorerComparison.NONE:
                return getMetricExplorerDataPoints(
                    dimension,
                    results.metric,
                    results.rows,
                );
            case MetricExplorerComparison.PREVIOUS_PERIOD:
                if (isFetching) {
                    return null;
                }

                if (!results.comparisonRows) {
                    throw new Error(
                        `Comparison rows are required for comparison type ${comparison.type}`,
                    );
                }

                return getMetricExplorerDataPointsWithCompare(
                    dimension,
                    dimension,
                    results.metric,
                    results.rows,
                    results.comparisonRows,
                    comparison,
                );
            case MetricExplorerComparison.DIFFERENT_METRIC:
                if (isFetching) {
                    return null;
                }

                if (!results.comparisonRows) {
                    return null;
                }

                if (!results.comparisonMetric) {
                    throw new Error(
                        `Comparison metric not found for comparison type ${comparison.type}`,
                    );
                }

                const compareMetric = results.comparisonMetric;
                const compareTimeDimension = compareMetric.timeDimension;

                if (!compareTimeDimension) {
                    throw new Error(
                        `Comparison metric should always have an associated time dimension`,
                    );
                }

                const compareDimensionId = getFieldIdForDateDimension(
                    getItemId({
                        name: compareTimeDimension.field,
                        table: compareTimeDimension.table,
                    }),
                    timeDimension.interval,
                );

                const compareDimension = results.fields[compareDimensionId];

                if (!compareDimension || !isDimension(compareDimension)) {
                    throw new Error(
                        `Comparison dimension not found for comparison type ${comparison.type}`,
                    );
                }

                return getMetricExplorerDataPointsWithCompare(
                    dimension,
                    compareDimension,
                    results.metric,
                    results.rows,
                    results.comparisonRows,
                    comparison,
                );
            default:
                return assertUnreachable(comparison, `Unknown comparison type`);
        }
    }, [comparison, results, isFetching]);

    const data = useMemo(() => {
        if (!dataPoints) return [];

        return dataPoints
            .map((row) => ({ ...row, dateValue: row.date.valueOf() }))
            .sort((a, b) => a.dateValue - b.dateValue);
    }, [dataPoints]);

    const {
        zoomState,
        handlers: {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            resetZoom,
        },
        activeData,
    } = useChartZoom({ data });

    useEffect(() => {
        resetZoom();
    }, [data, resetZoom]);

    const xAxisConfig = useMemo(() => {
        if (!data) return null;

        const timeValues = activeData.map((row) => row.dateValue);
        const timeScale = scaleTime().domain([
            Math.min(...timeValues),
            Math.max(...timeValues),
        ]);

        return {
            domain: timeScale.domain().map((date) => date.valueOf()),
            scale: timeScale,
            type: 'number' as const,
            ticks: timeScale.ticks(5).map((date) => date.valueOf()),
            tickFormatter,
        };
    }, [data, activeData]);

    const showEmptyState = dataPoints?.length === 0;

    return (
        <Stack
            spacing={showEmptyState ? 'sm' : 'lg'}
            pb={showEmptyState ? 'sm' : undefined}
            w="100%"
            h="100%"
            sx={{ flexGrow: 1 }}
        >
            <Group spacing="sm" noWrap>
                {dateRange && results?.metric.timeDimension && (
                    <MetricPeekDatePicker
                        dateRange={dateRange}
                        onChange={onDateRangeChange}
                        showTimeDimensionIntervalPicker={
                            showTimeDimensionIntervalPicker
                        }
                        timeDimensionBaseField={timeDimensionBaseField}
                        setTimeDimensionOverride={setTimeDimensionOverride}
                        timeInterval={results.metric.timeDimension.interval}
                        onTimeIntervalChange={onTimeIntervalChange}
                    />
                )}
                <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    radius="md"
                    disabled={!zoomState.zoomedData}
                    leftIcon={<MantineIcon icon={IconZoomReset} />}
                    onClick={resetZoom}
                >
                    Reset zoom
                </Button>
            </Group>

            {showEmptyState && <MetricsVisualizationEmptyState />}

            {!showEmptyState && results && (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={activeData}
                        margin={{
                            top: 40,
                            right: 40,
                            bottom: 40,
                            left: 40,
                        }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        <CartesianGrid
                            horizontal
                            vertical={false}
                            stroke={colors.gray[2]}
                            strokeDasharray="4 3"
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            fontSize={11}
                            width={4}
                            domain={['dataMin - 1', 'dataMax + 1']}
                            allowDataOverflow={false}
                        />

                        <XAxis
                            dataKey="dateValue"
                            {...xAxisConfig}
                            axisLine={{ stroke: colors.gray[2] }}
                            tickLine={false}
                            fontSize={11}
                        />

                        <RechartsTooltip
                            formatter={(value) => [value, results.metric.label]}
                            labelFormatter={(label) =>
                                dayjs(label).format('MMM D, YYYY')
                            }
                            contentStyle={{
                                fontSize: fontSizes.xs,
                                backgroundColor: colors.offWhite[0],
                                borderRadius: radius.md,
                                border: `1px solid ${colors.gray[2]}`,
                                boxShadow: shadows.sm,
                            }}
                        />

                        <Line
                            name={results.metric.label}
                            type="monotone"
                            dataKey="metric"
                            stroke={colors.indigo[6]}
                            strokeWidth={1.6}
                            dot={false}
                            legendType="plainline"
                        />

                        {results.comparisonRows && (
                            <Line
                                name={`${results.metric.label} (comparison)`}
                                type="monotone"
                                dataKey="compareMetric"
                                stroke={colors.indigo[4]}
                                strokeDasharray={'3 3'}
                                strokeWidth={1.3}
                                dot={false}
                                legendType="plainline"
                            />
                        )}

                        <Legend
                            formatter={(value) => (
                                <Text span c="dark.5" size={14} fw={400}>
                                    {value}
                                </Text>
                            )}
                        />

                        {zoomState.refAreaLeft && zoomState.refAreaRight && (
                            <ReferenceArea
                                x1={zoomState.refAreaLeft}
                                x2={zoomState.refAreaRight}
                                strokeOpacity={0.3}
                                fill={colors.gray[3]}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            )}
        </Stack>
    );
};

export default MetricsVisualization;
