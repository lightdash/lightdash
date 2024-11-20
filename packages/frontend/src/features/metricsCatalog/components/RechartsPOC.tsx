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
import { timeFormat } from 'd3-time-format';
import dayjs from 'dayjs';
import type { FC } from 'react';
import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

const FORMATS = {
    millisecond: timeFormat('.%L'),
    second: timeFormat(':%S'),
    minute: timeFormat('%I:%M'),
    hour: timeFormat('%I %p'),
    day: timeFormat('%a %d'),
    week: timeFormat('%b %d'),
    month: timeFormat('%B'),
    year: timeFormat('%Y'),
};

function multiFormat(date: Date) {
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
}

const data = [
    {
        orders_order_date_day: dayjs('2018-04-08', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 72.06,
    },
    {
        orders_order_date_day: dayjs('2018-04-06', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 49.08,
    },
    {
        orders_order_date_day: dayjs('2018-04-05', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 34.99,
    },
    {
        orders_order_date_day: dayjs('2018-04-03', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 48.99,
    },
    {
        orders_order_date_day: dayjs('2018-04-02', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 67.7,
    },
    {
        orders_order_date_day: dayjs('2018-04-01', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 35.45,
    },
    {
        orders_order_date_day: dayjs('2018-03-30', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 38.6,
    },
    {
        orders_order_date_day: dayjs('2018-03-29', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 22.5,
    },
    {
        orders_order_date_day: dayjs('2018-03-27', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 44.4,
    },
    {
        orders_order_date_day: dayjs('2018-03-26', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-03-25', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 65,
    },
    {
        orders_order_date_day: dayjs('2018-03-23', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-03-22', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 58,
    },
    {
        orders_order_date_day: dayjs('2018-03-20', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 19,
    },
    {
        orders_order_date_day: dayjs('2018-03-19', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 40,
    },
    {
        orders_order_date_day: dayjs('2018-03-17', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 19,
    },
    {
        orders_order_date_day: dayjs('2018-03-16', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-03-15', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 60,
    },
    {
        orders_order_date_day: dayjs('2018-03-13', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 29,
    },
    {
        orders_order_date_day: dayjs('2018-03-11', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 31,
    },
    {
        orders_order_date_day: dayjs('2018-03-10', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 58,
    },
    {
        orders_order_date_day: dayjs('2018-03-09', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 28,
    },
    {
        orders_order_date_day: dayjs('2018-03-07', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-03-06', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 26,
    },
    {
        orders_order_date_day: dayjs('2018-03-05', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 29,
    },
    {
        orders_order_date_day: dayjs('2018-03-04', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 14,
    },
    {
        orders_order_date_day: dayjs('2018-03-02', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 20,
    },
    {
        orders_order_date_day: dayjs('2018-03-01', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 28,
    },
    {
        orders_order_date_day: dayjs('2018-02-28', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 26,
    },
    {
        orders_order_date_day: dayjs('2018-02-27', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-02-26', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 29,
    },
    {
        orders_order_date_day: dayjs('2018-02-25', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 32,
    },
    {
        orders_order_date_day: dayjs('2018-02-24', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 15,
    },
    {
        orders_order_date_day: dayjs('2018-02-23', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-02-22', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 26,
    },
    {
        orders_order_date_day: dayjs('2018-02-20', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 18,
    },
    {
        orders_order_date_day: dayjs('2018-02-19', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 22,
    },
    {
        orders_order_date_day: dayjs('2018-02-18', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 10,
    },
    {
        orders_order_date_day: dayjs('2018-02-16', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 34,
    },
    {
        orders_order_date_day: dayjs('2018-02-15', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 17,
    },
    {
        orders_order_date_day: dayjs('2018-02-13', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 17,
    },
    {
        orders_order_date_day: dayjs('2018-02-12', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 14,
    },
    {
        orders_order_date_day: dayjs('2018-02-10', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 40,
    },
    {
        orders_order_date_day: dayjs('2018-02-09', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 47,
    },
    {
        orders_order_date_day: dayjs('2018-02-07', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 29,
    },
    {
        orders_order_date_day: dayjs('2018-02-05', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 30,
    },
    {
        orders_order_date_day: dayjs('2018-02-03', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 25,
    },
    {
        orders_order_date_day: dayjs('2018-02-01', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 25,
    },
    {
        orders_order_date_day: dayjs('2018-01-30', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 12,
    },
    {
        orders_order_date_day: dayjs('2018-01-28', 'YYYY-MM-DD').toDate(),
        payments_total_revenue: 42,
    },
];

const timeValues = data.map((row) => row.orders_order_date_day);
// The d3 scaleTime domain requires numeric values
const numericValues = timeValues.map((time) => time.valueOf());
// With .nice() we extend the domain nicely.
const timeScale = scaleTime()
    .domain([Math.min(...numericValues), Math.max(...numericValues)])
    .nice();

const xAxisArgs = {
    domain: timeScale.domain().map((date) => date.valueOf()),
    scale: timeScale,
    type: 'number' as const,
    ticks: timeScale.ticks(5).map((date) => date.valueOf()),
    tickFormatter: multiFormat,
};

const RechartsPOC: FC = () => {
    const { colors } = useMantineTheme();

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart
                data={data}
                height={250}
                margin={{
                    top: 0,
                    right: 10,
                    left: 10,
                    bottom: 10,
                }}
            >
                <defs>
                    <linearGradient id="gradient1" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="5%"
                            stopColor={colors.violet[9]}
                            stopOpacity={0.8}
                        />
                        <stop
                            offset="95%"
                            stopColor={colors.violet[9]}
                            stopOpacity={0}
                        />
                    </linearGradient>
                </defs>

                <XAxis
                    {...xAxisArgs}
                    dataKey="orders_order_date_day"
                    name="Order date"
                />
                <YAxis
                    dataKey="payments_total_revenue"
                    name="Total revenue"
                    label={{
                        value: 'Total revenue',
                        angle: -90,
                        position: 'insideLeft',
                    }}
                />

                <Area
                    isAnimationActive={false}
                    name="Total revenue"
                    type="monotone"
                    dataKey="payments_total_revenue"
                    stroke={colors.violet[6]}
                    strokeWidth={2}
                    fillOpacity={0.5}
                    fill="url(#gradient1)"
                    dot={false}
                />
                <Tooltip />
            </AreaChart>
        </ResponsiveContainer>
    );
};

export default RechartsPOC;
