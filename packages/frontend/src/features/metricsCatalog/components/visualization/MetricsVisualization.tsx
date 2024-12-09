import {
    capitalize,
    friendlyName,
    MetricExplorerComparison,
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
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconInfoCircle, IconZoomReset } from '@tabler/icons-react';
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
import { useAppSelector } from '../../../sqlRunner/store/hooks';
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
    comparison,
    isFetching,
}) => {
    const canManageExplore = useAppSelector(
        (state) => state.metricsCatalog.abilities.canManageExplore,
    );
    const { colors, radius, fontSizes, spacing } = useMantineTheme();

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
    const showLegend = comparison?.type !== MetricExplorerComparison.NONE;

    const legendConfig = useMemo(() => {
        if (comparison.type === MetricExplorerComparison.NONE) return null;
        if (comparison.type === MetricExplorerComparison.DIFFERENT_METRIC) {
            return [results?.metric.label, results?.compareMetric?.label];
        }
        if (comparison.type === MetricExplorerComparison.PREVIOUS_PERIOD) {
            return [results?.metric.label, 'Previous period'];
        }
        return [results?.metric.label];
    }, [comparison, results]);

    return (
        <Stack spacing="sm" w="100%" h="100%">
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
                                left: 50,
                                top: 10,
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                        >
                            {showLegend && (
                                <Legend
                                    verticalAlign="top"
                                    height={50}
                                    margin={{ bottom: 20 }}
                                    formatter={(value) => (
                                        <Text
                                            span
                                            c="dark.5"
                                            size={14}
                                            fw={400}
                                        >
                                            {value}
                                        </Text>
                                    )}
                                />
                            )}
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
                                label={
                                    !showLegend
                                        ? {
                                              value: results?.metric.label,
                                              angle: -90,
                                              position: 'left',
                                              offset: 40,
                                              style: {
                                                  fontSize: 13,
                                                  fill: colors.dark[5],
                                                  fontWeight: 500,
                                              },
                                          }
                                        : undefined
                                }
                            />

                            <XAxis
                                dataKey="dateValue"
                                {...xAxisConfig}
                                axisLine={{ stroke: colors.gray[2] }}
                                tickLine={false}
                                fontSize={11}
                            />

                            <RechartsTooltip
                                {...(comparison.type ===
                                    MetricExplorerComparison.NONE && {
                                    formatter: (value) => [
                                        value,
                                        results?.metric.label,
                                    ],
                                })}
                                labelFormatter={(label) =>
                                    dayjs(label).format('MMM D, YYYY')
                                }
                                labelStyle={{
                                    fontWeight: 500,
                                    color: colors.gray[7],
                                    fontSize: 13,
                                }}
                                contentStyle={{
                                    fontSize: fontSizes.xs,
                                    fontWeight: 500,
                                    backgroundColor: colors.offWhite[0],
                                    borderRadius: radius.md,
                                    border: `1px solid ${colors.gray[2]}`,
                                    boxShadow:
                                        '0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25)',
                                    padding: spacing.sm,
                                }}
                            />

                            <Line
                                name={legendConfig?.[0]}
                                type="linear"
                                dataKey="metric"
                                label={legendConfig?.[0]}
                                stroke={colors.indigo[6]}
                                strokeWidth={1.6}
                                dot={false}
                                legendType="plainline"
                            />

                            {results.compareMetric && (
                                <Line
                                    name={legendConfig?.[1]}
                                    type="linear"
                                    dataKey="compareMetric"
                                    label={legendConfig?.[1]}
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
            <Group
                position="center"
                mt="auto"
                sx={{
                    visibility: isFetching ? 'hidden' : 'visible',
                }}
            >
                <Group align="center" noWrap>
                    <Tooltip
                        variant="xs"
                        label={friendlyName(
                            results?.metric.timeDimension?.field ?? '',
                        )}
                        disabled={!!results?.metric.availableTimeDimensions}
                    >
                        <Text fw={500} c="gray.7" fz="sm">
                            Date ({capitalize(timeDimensionBaseField.interval)})
                        </Text>
                    </Tooltip>

                    {results?.metric.availableTimeDimensions && (
                        <Group spacing="xs">
                            <TimeDimensionPicker
                                fields={results.metric.availableTimeDimensions}
                                dimension={timeDimensionBaseField}
                                onChange={(config) =>
                                    setTimeDimensionOverride(config)
                                }
                            />
                            <Tooltip
                                variant="xs"
                                disabled={!canManageExplore}
                                label="Define a default x-axis in your .yml file to skip this step and simplify the experience for your users."
                            >
                                <MantineIcon
                                    color="gray.6"
                                    icon={IconInfoCircle}
                                    display={
                                        canManageExplore ? 'block' : 'none'
                                    }
                                />
                            </Tooltip>
                        </Group>
                    )}
                </Group>
            </Group>
        </Stack>
    );
};

export default MetricsVisualization;
