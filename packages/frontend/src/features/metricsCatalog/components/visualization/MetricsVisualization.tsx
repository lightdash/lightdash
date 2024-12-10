import {
    capitalize,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
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
import { TimeDimensionPicker } from './TimeDimensionPicker';
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
    onDateRangeChange,
    showTimeDimensionIntervalPicker,
    timeDimensionBaseField,
    setTimeDimensionOverride,
    onTimeIntervalChange,
}) => {
    const { colors, radius, shadows, fontSizes } = useMantineTheme();

    const data = useMemo(() => {
        if (!results?.results) return [];
        return results.results;
    }, [results]);

    const {
        activeData,
        zoomState,
        handlers: {
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
            resetZoom,
        },
    } = useChartZoom({ data });

    useEffect(() => {
        resetZoom();
    }, [data, resetZoom]);

    const xAxisConfig = useMemo(() => {
        const timeValues = activeData.map((row) => row.dateValue);
        const timeScale = scaleTime().domain([
            new Date(Math.min(...timeValues)),
            new Date(Math.max(...timeValues)),
        ]);

        return {
            domain: [Math.min(...timeValues), Math.max(...timeValues)],
            scale: timeScale,
            type: 'number' as const,
            ticks: timeScale.ticks(5).map((d) => d.valueOf()),
            tickFormatter,
        };
    }, [activeData]);

    const showEmptyState = activeData.length === 0;

    return (
        <Stack spacing="sm" pb="sm" w="100%" h="100%">
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
                <Flex sx={{ flex: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={activeData}
                            margin={{
                                right: 40,
                                left: 40,
                                top: 10,
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                        >
                            <Legend
                                verticalAlign="top"
                                height={50}
                                margin={{ bottom: 20 }}
                                formatter={(value) => (
                                    <Text span c="dark.5" size={14} fw={400}>
                                        {value}
                                    </Text>
                                )}
                            />
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
                                formatter={(value) => [
                                    value,
                                    results.metric.label,
                                ]}
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
                                type="linear"
                                dataKey="metric"
                                stroke={colors.indigo[6]}
                                strokeWidth={1.6}
                                dot={false}
                                legendType="plainline"
                            />

                            {results.compareMetric && (
                                <Line
                                    name={`${results.metric.label} (comparison)`}
                                    type="linear"
                                    dataKey="compareMetric"
                                    stroke={colors.indigo[4]}
                                    strokeDasharray={'3 3'}
                                    strokeWidth={1.3}
                                    dot={false}
                                    legendType="plainline"
                                />
                            )}

                            {zoomState.refAreaLeft &&
                                zoomState.refAreaRight && (
                                    <ReferenceArea
                                        x1={zoomState.refAreaLeft}
                                        x2={zoomState.refAreaRight}
                                        strokeOpacity={0.3}
                                        fill={colors.gray[3]}
                                    />
                                )}
                        </LineChart>
                    </ResponsiveContainer>
                </Flex>
            )}
            {results?.metric.availableTimeDimensions && (
                <Group position="center" mt="auto">
                    <Group align="center" noWrap>
                        <Text fw={500} c="gray.7" fz="sm">
                            Date ({capitalize(timeDimensionBaseField.interval)})
                        </Text>

                        <TimeDimensionPicker
                            fields={results.metric.availableTimeDimensions}
                            dimension={timeDimensionBaseField}
                            onChange={(config) =>
                                setTimeDimensionOverride(config)
                            }
                        />
                    </Group>
                </Group>
            )}
        </Stack>
    );
};

export default MetricsVisualization;
