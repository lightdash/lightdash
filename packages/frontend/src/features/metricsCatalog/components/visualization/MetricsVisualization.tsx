import {
    getItemId,
    type MetricsExplorerQueryResults,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { Button, Group, Stack, useMantineTheme } from '@mantine/core';
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
    Label,
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
import { FORMATS, type TimeSeriesData } from './types';
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
    metric: MetricWithAssociatedTimeDimension;
    data: MetricsExplorerQueryResults;
};

const MetricsVisualization: FC<Props> = ({ metric, data }) => {
    const { colors, radius, shadows, fontSizes } = useMantineTheme();
    const timeDimension = metric.defaultTimeDimension;

    const timeSeriesData: TimeSeriesData[] | null = useMemo(() => {
        if (!timeDimension) return null;

        // TODO: zipping with index is not a smart idea.
        return data.rows.map((row, index) => ({
            date: new Date(
                String(
                    row[
                        getItemId({
                            table: metric.table,
                            name: timeDimension.field,
                        })
                    ].value.raw,
                ),
            ),
            metric: row[
                getItemId({
                    table: metric.table,
                    name: metric.name,
                })
            ].value.raw,
            ...(data.comparisonRows
                ? {
                      compareMetric:
                          data.comparisonRows[index][
                              getItemId({
                                  table: metric.table,
                                  name: metric.name,
                              })
                          ]?.value.raw,
                  }
                : {}),
        }));
    }, [
        timeDimension,
        data.rows,
        data.comparisonRows,
        metric.table,
        metric.name,
    ]);

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
        data: timeSeriesData || [],
    });

    useEffect(() => {
        resetZoom();
    }, [data.comparisonRows, resetZoom]);

    const xAxisConfig = useMemo(() => {
        if (!timeSeriesData) return null;

        const timeValues = activeData.map((row) => row.date);
        const numericValues = timeValues.map((time) => time.valueOf());
        const timeScale = scaleTime().domain([
            Math.min(...numericValues),
            Math.max(...numericValues),
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
        <Stack spacing="md" w="100%" h="100%" sx={{ flexGrow: 1 }}>
            <Group position="right" px="md">
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
                    />

                    <YAxis axisLine={false} tickLine={false} fontSize={11}>
                        <Label
                            angle={-90}
                            position="insideLeft"
                            value={metric.label}
                            fill={colors.gray[7]}
                            style={{ textAnchor: 'middle' }}
                        />
                    </YAxis>

                    <XAxis
                        dataKey="date"
                        {...xAxisConfig}
                        axisLine={false}
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
                        stroke={colors.indigo[7]}
                        strokeWidth={2}
                        dot={false}
                    />

                    {data.comparisonRows && (
                        <Line
                            name={`${metric.label} (comparison)`}
                            type="monotone"
                            dataKey="compareMetric"
                            stroke={colors.teal[7]}
                            strokeDasharray={'3 3'}
                            strokeWidth={2}
                            dot={false}
                        />
                    )}

                    <Legend />

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
