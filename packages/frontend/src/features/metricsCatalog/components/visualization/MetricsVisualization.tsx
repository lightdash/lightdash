import {
    getFieldIdForDateDimension,
    getGrainForDateRange,
    getItemId,
    getMetricExplorerDataPoints,
    getMetricExplorerDataPointsWithCompare,
    isDimension,
    type MetricExplorerDateRange,
    type MetricsExplorerQueryResults,
    type MetricWithAssociatedTimeDimension,
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
    dateRange: MetricExplorerDateRange | undefined;
    metric: MetricWithAssociatedTimeDimension;
    data: MetricsExplorerQueryResults;
};

const MetricsVisualization: FC<Props> = ({ metric, data, dateRange }) => {
    const { colors, radius, shadows, fontSizes } = useMantineTheme();

    const timeSeriesData = useMemo(() => {
        const defaultTimeDimension = metric.defaultTimeDimension;
        if (!defaultTimeDimension) return null;

        const dimensionGrain = dateRange
            ? getGrainForDateRange(dateRange)
            : defaultTimeDimension.interval;

        const dimensionId = getFieldIdForDateDimension(
            getItemId({
                name: defaultTimeDimension.field,
                table: metric.table,
            }),
            dimensionGrain,
        );

        if (!dimensionId || !data.fields[dimensionId]) return null;
        if (!data.rows) return null;

        const dimension = data.fields[dimensionId];
        if (!isDimension(dimension)) return null;

        const rawData = !!data.comparisonRows
            ? getMetricExplorerDataPointsWithCompare(
                  dimension,
                  metric,
                  data.rows,
                  data.comparisonRows,
              )
            : getMetricExplorerDataPoints(dimension, metric, data.rows);

        return rawData
            .map((row) => ({
                ...row,
                dateValue: row.date.valueOf(),
            }))
            .sort((a, b) => a.dateValue - b.dateValue);
    }, [data.comparisonRows, data.fields, data.rows, dateRange, metric]);

    const {
        zoomState,
        handlers: {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            resetZoom,
        },
        activeData,
    } = useChartZoom({
        data: timeSeriesData ?? [],
    });

    useEffect(() => {
        resetZoom();
    }, [data, resetZoom]);

    const xAxisConfig = useMemo(() => {
        if (!timeSeriesData) return null;

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
    }, [timeSeriesData, activeData]);

    if (!timeSeriesData) return null;

    return (
        <Stack spacing={0} w="100%" h="100%" sx={{ flexGrow: 1 }}>
            <Group position="right">
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

            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={activeData}
                    margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
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
                    />

                    <XAxis
                        dataKey="dateValue"
                        {...xAxisConfig}
                        axisLine={{ stroke: colors.gray[2] }}
                        tickLine={false}
                        fontSize={11}
                    />

                    <RechartsTooltip
                        formatter={(value) => [value, metric.label]}
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
                        name={metric.label}
                        type="monotone"
                        dataKey="metric"
                        stroke={colors.indigo[6]}
                        strokeWidth={1.6}
                        dot={false}
                        legendType="plainline"
                    />

                    {data.comparisonRows && (
                        <Line
                            name={`${metric.label} (comparison)`}
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
        </Stack>
    );
};

export default MetricsVisualization;
