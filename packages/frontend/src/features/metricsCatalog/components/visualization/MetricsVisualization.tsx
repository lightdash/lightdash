import {
    capitalize,
    friendlyName,
    MetricExplorerComparison,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Flex,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconLineDashed, IconMinus, IconZoomReset } from '@tabler/icons-react';
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
    type TooltipProps as RechartsTooltipProps,
} from 'recharts';
import {
    type NameType,
    type ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useDynamicYAxisWidth } from '../../hooks/useDynamicYAxisWidth';
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

const CustomTooltip = ({
    active,
    payload,
    label,
}: RechartsTooltipProps<ValueType, NameType>) => {
    if (!active || !payload || !payload.length) {
        return null;
    }

    return (
        <Stack
            sx={(theme) => ({
                fontSize: theme.fontSizes.xs,
                fontWeight: 500,
                backgroundColor: 'white',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.gray[2]}`,
                boxShadow:
                    '0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25)',
                padding: theme.spacing.sm,
            })}
            spacing="xs"
        >
            <Text c="gray.7" fz={13} fw={500}>{`${dayjs(label).format(
                'MMM D, YYYY',
            )}`}</Text>
            {payload.map((entry) => (
                <Group key={entry.name} position="apart">
                    <Group spacing={4}>
                        <MantineIcon
                            color="indigo.6"
                            icon={
                                entry.name === 'metric'
                                    ? IconMinus
                                    : IconLineDashed
                            }
                        />
                        <Text c="gray.8" fz={13} fw={500}>
                            {entry.name
                                ? entry.payload[entry.name].label
                                : null}
                        </Text>
                    </Group>

                    <Badge
                        variant="light"
                        color="indigo"
                        radius="md"
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.indigo[1]}`,
                        })}
                    >
                        {entry.name ? entry.payload[entry.name].value : null}{' '}
                    </Badge>
                </Group>
            ))}
        </Stack>
    );
};

type Props = {
    results: MetricsExplorerQueryResults | undefined;
    dateRange: MetricExplorerDateRange | undefined;
    query: MetricExplorerQuery;
    onDateRangeChange: (range: MetricExplorerDateRange) => void;
    showTimeDimensionIntervalPicker: boolean;
    timeDimensionBaseField: TimeDimensionConfig;
    setTimeDimensionOverride: (config: TimeDimensionConfig | undefined) => void;
    onTimeIntervalChange: (interval: TimeFrames) => void;
    isFetching: boolean;
};

const CHART_COLORS = [
    'indigo',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
];

const MetricsVisualization: FC<Props> = ({
    results,
    dateRange,
    onDateRangeChange,
    showTimeDimensionIntervalPicker,
    timeDimensionBaseField,
    setTimeDimensionOverride,
    onTimeIntervalChange,
    query,
    isFetching,
}) => {
    const { yAxisWidth, setChartRef } = useDynamicYAxisWidth();
    const canManageExplore = useAppSelector(
        (state) => state.metricsCatalog.abilities.canManageExplore,
    );
    const { colors } = useMantineTheme();

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

    const segmentedData = useMemo((): {
        segment: string | null;
        color: string;
        data: MetricsExplorerQueryResults['results'];
    }[] => {
        const segmentsMap = new Map<
            string | null,
            MetricsExplorerQueryResults['results']
        >();

        activeData.forEach((row) => {
            const segment = row.segment; // Preserve `null` as is
            if (!segmentsMap.has(segment)) {
                segmentsMap.set(segment, []);
            }
            segmentsMap.get(segment)!.push(row);
        });

        return Array.from(segmentsMap.entries()).map(
            ([segment, segmentData], i) => ({
                segment,
                color: colors[CHART_COLORS[i % CHART_COLORS.length]]?.[6],
                data: segmentData,
            }),
        );
    }, [activeData, colors]);

    const showEmptyState = activeData.length === 0;
    const showLegend = query.comparison !== MetricExplorerComparison.NONE;

    const legendConfig = useMemo(() => {
        switch (query.comparison) {
            case MetricExplorerComparison.NONE:
                return null;
            case MetricExplorerComparison.DIFFERENT_METRIC:
            case MetricExplorerComparison.PREVIOUS_PERIOD: {
                return {
                    metric: { name: 'metric', label: results?.metric.label },
                    compareMetric: {
                        name: 'compareMetric',
                        label: results?.compareMetric?.label,
                    },
                };
            }

            default: {
                return {
                    metric: { name: 'metric', label: results?.metric.label },
                };
            }
        }
    }, [query, results]);

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

                <Tooltip
                    label="No zoom has been applied yet. Drag on the chart to zoom into a section"
                    variant="xs"
                    position="top"
                    disabled={!!zoomState.zoomedData}
                    withinPortal
                >
                    <Box>
                        <Button
                            variant="light"
                            color="indigo"
                            size="xs"
                            radius="md"
                            disabled={!zoomState.zoomedData}
                            leftIcon={<MantineIcon icon={IconZoomReset} />}
                            onClick={resetZoom}
                            sx={{
                                color: colors.indigo[7],
                                '&[data-disabled="true"]': {
                                    opacity: 0.5,
                                    backgroundColor: colors.gray[0],
                                },
                            }}
                            fz={14}
                            h={32}
                        >
                            Reset zoom
                        </Button>
                    </Box>
                </Tooltip>
            </Group>

            {showEmptyState && !isFetching && (
                <Flex sx={{ flex: 1, position: 'relative' }}>
                    <MetricsVisualizationEmptyState />
                </Flex>
            )}

            {!showEmptyState && results && (
                <Flex sx={{ flex: 1, position: 'relative' }}>
                    <LoadingOverlay
                        visible={isFetching}
                        loaderProps={{
                            size: 'sm',
                            color: 'dark',
                            variant: 'dots',
                        }}
                    />

                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            ref={(instance) => setChartRef(instance)}
                            margin={{
                                right: 40,
                                left: 10,
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
                                    formatter={(
                                        value: 'metric' | 'compareMetric',
                                    ) => (
                                        <Text
                                            span
                                            c="dark.5"
                                            size={14}
                                            fw={400}
                                        >
                                            {legendConfig?.[value]?.label ||
                                                value}
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
                                width={yAxisWidth}
                                domain={['dataMin - 1', 'dataMax + 1']}
                                allowDataOverflow={false}
                                label={
                                    !showLegend
                                        ? {
                                              value: results?.metric.label,
                                              angle: -90,
                                              position: 'left',
                                              dy: -60,
                                              style: {
                                                  fontSize: 13,
                                                  fill: colors.dark[5],
                                                  fontWeight: 500,
                                                  userSelect: 'none',
                                              },
                                          }
                                        : undefined
                                }
                                tickFormatter={(value) => value.toFixed(2)}
                                style={{ userSelect: 'none' }}
                            />

                            <XAxis
                                dataKey="dateValue"
                                {...xAxisConfig}
                                axisLine={{ stroke: colors.gray[2] }}
                                tickLine={false}
                                fontSize={11}
                                style={{ userSelect: 'none' }}
                            />

                            <RechartsTooltip content={<CustomTooltip />} />

                            {segmentedData.map((segment) => (
                                <Line
                                    key={segment.segment ?? 'metric'}
                                    type="linear"
                                    name="metric"
                                    data={segment.data}
                                    dataKey="metric.value"
                                    stroke={segment.color}
                                    strokeWidth={1.6}
                                    dot={false}
                                    legendType="plainline"
                                    isAnimationActive={false}
                                />
                            ))}

                            {results.compareMetric && (
                                <Line
                                    name="compareMetric"
                                    type="linear"
                                    dataKey="compareMetric.value"
                                    data={segmentedData[0].data}
                                    stroke={colors.indigo[4]}
                                    strokeDasharray={'3 3'}
                                    strokeWidth={1.3}
                                    dot={false}
                                    legendType="plainline"
                                    isAnimationActive={false}
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
                <Group align="center" noWrap spacing="xs">
                    <Tooltip
                        variant="xs"
                        label={friendlyName(
                            results?.metric.timeDimension?.field ?? '',
                        )}
                        disabled={!!results?.metric.availableTimeDimensions}
                    >
                        <Text fw={500} c="gray.7" fz={14}>
                            Date ({capitalize(timeDimensionBaseField.interval)})
                        </Text>
                    </Tooltip>

                    {results?.metric.availableTimeDimensions && (
                        <Tooltip
                            variant="xs"
                            disabled={!canManageExplore}
                            label="Define a default x-axis in your .yml file to skip this step and simplify the experience for your users"
                        >
                            <Box>
                                <TimeDimensionPicker
                                    fields={
                                        results.metric.availableTimeDimensions
                                    }
                                    dimension={timeDimensionBaseField}
                                    onChange={(config) =>
                                        setTimeDimensionOverride(config)
                                    }
                                />
                            </Box>
                        </Tooltip>
                    )}
                </Group>
            </Group>
        </Stack>
    );
};

export default MetricsVisualization;
