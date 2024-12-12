import {
    applyCustomFormat,
    capitalize,
    friendlyName,
    getCustomFormat,
    MetricExplorerComparison,
    type MetricExploreDataPointWithDateValue,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Flex,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
    type DefaultMantineColor,
} from '@mantine/core';
import { IconLineDashed, IconMinus } from '@tabler/icons-react';
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
import { uniqBy } from 'lodash';
import { useMemo, type FC } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    // REMOVE COMMENTS TO ENABLE CHART ZOOM
    // ReferenceArea,
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
// REMOVE COMMENTS TO ENABLE CHART ZOOM
// import { useChartZoom } from './useChartZoom';

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

type RechartsTooltipPropsPayload = NonNullable<
    RechartsTooltipProps<ValueType, NameType>['payload']
>[number];

interface CustomTooltipPropsPayload extends RechartsTooltipPropsPayload {
    payload: MetricExploreDataPointWithDateValue;
}

interface CustomTooltipProps extends RechartsTooltipProps<ValueType, NameType> {
    payload?: CustomTooltipPropsPayload[];
}

const CustomTooltipPayloadEntry = ({
    entry,
    color,
}: {
    entry: CustomTooltipPropsPayload;
    color?: DefaultMantineColor;
}) => {
    const entryData = useMemo(() => {
        if (!entry.name) {
            return null;
        }

        const isCompareMetric = entry.name === 'compareMetric';
        return isCompareMetric
            ? entry.payload.compareMetric
            : entry.payload.metric;
    }, [entry]);

    if (!entryData) {
        return null;
    }

    return (
        <Group position="apart">
            <Group spacing={4}>
                <MantineIcon
                    color={color ?? 'indigo.6'}
                    icon={entry.name === 'metric' ? IconMinus : IconLineDashed}
                />
                <Text c="gray.8" fz={13} fw={500}>
                    {entryData.label}
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
                {entryData.formatted}
            </Badge>
        </Group>
    );
};

function getUniqueEntryKey(entry: CustomTooltipPropsPayload) {
    return `${entry.name}_${entry.payload.segment}_${entry.payload.dateValue}_${entry.payload.metric.value}`;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    const uniqueEntries = useMemo(() => {
        return uniqBy(payload, getUniqueEntryKey);
    }, [payload]);

    if (!active || !uniqueEntries || !uniqueEntries.length) {
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
            {uniqueEntries.map((entry) => (
                <CustomTooltipPayloadEntry
                    key={getUniqueEntryKey(entry)}
                    entry={entry}
                    color={entry.stroke}
                />
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

const CHART_MANTINE_COLORS = [
    'violet',
    'teal',
    'lime',
    'yellow',
    'gray',
    'blue',
    'red',
    'pink',
    'cyan',
    'orange',
];

const CHART_MANTINE_COLOR_INDEX = 4;

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
    const { leftYAxisWidth, rightYAxisWidth, setChartRef } =
        useDynamicYAxisWidth();

    const canManageExplore = useAppSelector(
        (state) => state.metricsCatalog.abilities.canManageExplore,
    );

    const { colors } = useMantineTheme();

    const data = useMemo(() => {
        if (!results?.results) return [];
        return results.results;
    }, [results]);

    // REMOVE THIS LINE TO ENABLE CHART ZOOM
    const activeData = data;

    // REMOVE COMMENTS TO ENABLE CHART ZOOM
    // const {
    //     activeData,
    //     zoomState,
    //     handlers: {
    //         handleMouseDown,
    //         handleMouseMove,
    //         handleMouseUp,
    //         resetZoom,
    //     },
    // } = useChartZoom({ data });

    // useEffect(() => {
    //     resetZoom();
    // }, [data, resetZoom]);

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
                color: colors[
                    CHART_MANTINE_COLORS[i % CHART_MANTINE_COLORS.length]
                ][CHART_MANTINE_COLOR_INDEX],
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

    const formatConfig = useMemo(() => {
        return {
            metric: getCustomFormat(results?.metric),
            compareMetric: getCustomFormat(results?.compareMetric ?? undefined),
        };
    }, [results]);

    const shouldSplitYAxis = useMemo(() => {
        return (
            query.comparison !== MetricExplorerComparison.NONE &&
            formatConfig.compareMetric !== formatConfig.metric
        );
    }, [query.comparison, formatConfig]);

    const commonYAxisConfig = {
        axisLine: false,
        tickLine: false,
        fontSize: 11,
        allowDataOverflow: false,
        domain: ['dataMin - 1', 'dataMax + 1'],
    };

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

                {/*
                REMOVE COMMENTS TO ENABLE CHART ZOOM
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
                </Tooltip> */}
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
                            // REMOVE COMMENTS TO ENABLE CHART ZOOM
                            // onMouseDown={handleMouseDown}
                            // onMouseMove={handleMouseMove}
                            // onMouseUp={handleMouseUp}
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
                                yAxisId="metric"
                                dataKey="metric.value"
                                width={leftYAxisWidth}
                                {...commonYAxisConfig}
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
                                tickFormatter={(value) => {
                                    return applyCustomFormat(
                                        value,
                                        formatConfig.metric,
                                    );
                                }}
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
                                    yAxisId="metric"
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
                                <>
                                    {shouldSplitYAxis && (
                                        <YAxis
                                            yAxisId="compareMetric"
                                            dataKey="compareMetric.value"
                                            orientation="right"
                                            width={rightYAxisWidth}
                                            {...commonYAxisConfig}
                                            tickFormatter={(value) => {
                                                return applyCustomFormat(
                                                    value,
                                                    formatConfig.compareMetric,
                                                );
                                            }}
                                            style={{ userSelect: 'none' }}
                                        />
                                    )}

                                    <Line
                                        name="compareMetric"
                                        yAxisId={
                                            shouldSplitYAxis
                                                ? 'compareMetric'
                                                : 'metric'
                                        }
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
                                </>
                            )}

                            {/*
                            REMOVE COMMENTS TO ENABLE CHART ZOOM
                            {zoomState.refAreaLeft &&
                                zoomState.refAreaRight && (
                                    <ReferenceArea
                                        x1={zoomState.refAreaLeft}
                                        x2={zoomState.refAreaRight}
                                        strokeOpacity={0.3}
                                        fill={colors.gray[3]}
                                    />
                                )}
                            */}
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
