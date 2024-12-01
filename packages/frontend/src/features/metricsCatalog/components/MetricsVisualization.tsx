import {
    getItemId,
    type MetricsExplorerQueryResults,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
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
import { useMemo, type FC } from 'react';
import {
    CartesianGrid,
    Label,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';

const FORMATS = {
    millisecond: (date: Date) => dayjs(date).format('HH:mm:ss.SSS'),
    second: (date: Date) => dayjs(date).format('HH:mm:ss'),
    minute: (date: Date) => dayjs(date).format('HH:mm'),
    hour: (date: Date) => dayjs(date).format('HH:mm'),
    day: (date: Date) => dayjs(date).format('MMM D'),
    week: (date: Date) => dayjs(date).format('MMM D'),
    month: (date: Date) => dayjs(date).format('MMM'),
    year: (date: Date) => dayjs(date).format('YYYY'),
};

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

    const timeSeriesData = useMemo(() => {
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

    const xAxisArgs = useMemo(() => {
        if (!timeSeriesData) return null;

        const timeValues = timeSeriesData.map((row) => row.date);

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
    }, [timeSeriesData]);

    if (!timeSeriesData) return null;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart
                data={timeSeriesData}
                margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
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
                    {...xAxisArgs}
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
            </LineChart>
        </ResponsiveContainer>
    );
};

export default MetricsVisualization;
