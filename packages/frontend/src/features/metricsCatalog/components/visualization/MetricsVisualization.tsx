import {
    MetricExplorerComparison,
    assertUnreachable,
    capitalize,
    formatItemValue,
    friendlyName,
    getCustomFormat,
    type MetricExploreDataPointWithDateValue,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
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
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    Tooltip as RechartsTooltip,
    ReferenceArea,
    ResponsiveContainer,
    XAxis,
    YAxis,
} from 'recharts';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useDynamicYAxisWidth } from '../../hooks/useDynamicYAxisWidth';
import {
    is5YearDateRange,
    isInCurrentTimeFrame,
} from '../../utils/metricExploreDate';
import { MetricsVisualizationEmptyState } from '../MetricsVisualizationEmptyState';
import { MetricExploreDatePicker } from './MetricExploreDatePicker';
import { MetricExploreLegend } from './MetricExploreLegend';
import { MetricExploreTooltip } from './MetricExploreTooltip';
import { TimeDimensionPicker } from './TimeDimensionPicker';
import {
    COMPARISON_OPACITY,
    DATE_FORMATS,
    type MetricVisualizationFormatConfig,
} from './types';
import { useChartZoom } from './useChartZoom';

const tickFormatter = (date: Date) => {
    return (
        timeSecond(date) < date
            ? DATE_FORMATS.millisecond
            : timeMinute(date) < date
            ? DATE_FORMATS.second
            : timeHour(date) < date
            ? DATE_FORMATS.minute
            : timeDay(date) < date
            ? DATE_FORMATS.hour
            : timeMonth(date) < date
            ? timeWeek(date) < date
                ? DATE_FORMATS.day
                : DATE_FORMATS.week
            : timeYear(date) < date
            ? DATE_FORMATS.month
            : DATE_FORMATS.year
    )(date);
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

const DEFAULT_LINE_COLOR = 'indigo';
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
                color: segment
                    ? colors[
                          CHART_MANTINE_COLORS[i % CHART_MANTINE_COLORS.length]
                      ][CHART_MANTINE_COLOR_INDEX]
                    : colors[DEFAULT_LINE_COLOR][CHART_MANTINE_COLOR_INDEX],
                data: segmentData,
            }),
        );
    }, [activeData, colors]);

    const showEmptyState = activeData.length === 0;
    const showLegend =
        query.comparison !== MetricExplorerComparison.NONE ||
        segmentedData.length > 1;

    const showLabel =
        [
            MetricExplorerComparison.NONE,
            MetricExplorerComparison.PREVIOUS_PERIOD,
        ].includes(query.comparison) || segmentedData.length > 1;

    const is5YearDateRangePreset = useMemo(() => {
        if (!dateRange || !results?.metric.timeDimension?.interval)
            return false;
        return is5YearDateRange(
            dateRange,
            results?.metric.timeDimension?.interval,
        );
    }, [dateRange, results?.metric.timeDimension?.interval]);

    const legendConfig: Record<
        string | 'metric' | 'compareMetric',
        { name: string; label: string }
    > | null = useMemo(() => {
        switch (query.comparison) {
            case MetricExplorerComparison.NONE:
                if (segmentedData.length > 1) {
                    return segmentedData.reduce(
                        (acc, { segment }) => ({
                            ...acc,
                            ...(segment
                                ? {
                                      [segment]: {
                                          name: segment,
                                          label: segment,
                                      },
                                  }
                                : {}),
                        }),
                        {},
                    );
                }
                // Single series case (no segments)
                if (segmentedData.length === 1) {
                    return {
                        metric: {
                            name: 'metric',
                            label: results?.metric.label,
                        },
                    };
                }
                return null;
            case MetricExplorerComparison.DIFFERENT_METRIC: {
                return {
                    metric: {
                        name: 'metric',
                        label: results?.metric.label,
                    },
                    compareMetric: {
                        name: 'compareMetric',
                        label: results?.compareMetric?.label,
                    },
                };
            }
            case MetricExplorerComparison.PREVIOUS_PERIOD: {
                if (!dateRange || !results?.metric.timeDimension?.interval)
                    return null;

                if (!dateRange) {
                    return {
                        metric: {
                            name: 'metric',
                            label: results?.metric.label,
                        },
                        compareMetric: {
                            name: 'compareMetric',
                            label: results?.compareMetric?.label,
                        },
                    };
                }

                const currentPeriodStartDate = dayjs(dateRange[0]);
                const currentPeriodEndDate = dayjs(dateRange[1]);
                const currentPeriodStartYear = currentPeriodStartDate.year();
                const currentPeriodEndYear = currentPeriodEndDate.year();

                if (currentPeriodStartYear !== currentPeriodEndYear) {
                    if (is5YearDateRangePreset) {
                        return {
                            metric: {
                                name: 'metric',
                                label: `${currentPeriodStartYear}-${currentPeriodEndYear}`,
                            },
                            compareMetric: {
                                name: 'compareMetric',
                                label: `${currentPeriodStartYear - 1}-${
                                    currentPeriodEndYear - 1
                                }`,
                            },
                        };
                    }

                    const currentPeriodStartMonth =
                        currentPeriodStartDate.format('MMM');
                    const currentPeriodEndMonth =
                        currentPeriodEndDate.format('MMM');

                    return {
                        metric: {
                            name: 'metric',
                            label: `${currentPeriodStartMonth} ${currentPeriodStartYear} - ${currentPeriodEndMonth} ${currentPeriodEndYear}`,
                        },
                        compareMetric: {
                            name: 'compareMetric',
                            label: `${currentPeriodStartMonth} ${
                                currentPeriodStartYear - 1
                            } - ${currentPeriodEndMonth} ${
                                currentPeriodEndYear - 1
                            }`,
                        },
                    };
                }

                return {
                    metric: {
                        name: 'metric',
                        label: currentPeriodStartYear,
                    },
                    compareMetric: {
                        name: 'compareMetric',
                        label: `${currentPeriodStartYear - 1}`,
                    },
                };
            }

            default: {
                return {
                    metric: {
                        name: 'metric',
                        label: results?.metric.label,
                    },
                };
            }
        }
    }, [
        query.comparison,
        segmentedData,
        results?.metric.label,
        results?.metric.timeDimension?.interval,
        results?.compareMetric?.label,
        dateRange,
        is5YearDateRangePreset,
    ]);

    const formatConfig = useMemo<MetricVisualizationFormatConfig>(() => {
        return {
            metric: results?.metric,
            compareMetric: results?.compareMetric,
        };
    }, [results]);

    const shouldSplitYAxis = useMemo(() => {
        return (
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
            getCustomFormat(formatConfig.compareMetric ?? undefined) !==
                getCustomFormat(formatConfig.metric)
        );
    }, [query.comparison, formatConfig]);

    const commonYAxisConfig = {
        axisLine: false,
        tickLine: false,
        fontSize: 11,
        allowDataOverflow: false,
    };

    const [hoveringLegend, setHoveringLegend] = useState<string | null>(null);
    const [activeLegends, setActiveLegends] = useState<string[]>([]);

    const handleToggleLegend = useCallback(
        (name: string) => {
            setActiveLegends((prev) => {
                if (prev.includes(name)) {
                    return prev.filter((n) => n !== name);
                } else {
                    return [...prev, name];
                }
            });
        },
        [setActiveLegends],
    );

    const getLineProps = useCallback(
        (name: string) => {
            const legendIsActive =
                activeLegends.length === 0 || activeLegends.includes(name);
            const hoveredIsActive =
                hoveringLegend === null ||
                activeLegends.includes(hoveringLegend);

            let opacity = 1;
            if (hoveringLegend && hoveredIsActive) {
                opacity = name === hoveringLegend ? 1 : COMPARISON_OPACITY;
            }

            return {
                name,
                hide: !legendIsActive,
                strokeWidth:
                    legendIsActive && name === hoveringLegend ? 2.4 : 1.4,
                opacity,
            };
        },
        [activeLegends, hoveringLegend],
    );

    const getLegendProps = useCallback(
        (name: string) => {
            return {
                opacity:
                    activeLegends.length === 0 || activeLegends.includes(name)
                        ? 1
                        : COMPARISON_OPACITY,
            };
        },
        [activeLegends],
    );

    const resetLegendState = useCallback(() => {
        setActiveLegends([]);
        setHoveringLegend(null);
    }, [setActiveLegends, setHoveringLegend]);

    useEffect(() => {
        // Reset legend state when the comparison or segmentation changes
        resetLegendState();
    }, [resetLegendState, results?.segmentDimension]);

    const timeDimensionTooltipLabel = useMemo(() => {
        if (results?.metric.availableTimeDimensions) {
            return;
        }

        const metricTimeDimensionFriendlyName = friendlyName(
            results?.metric.timeDimension?.field ?? '',
        );

        if (query.comparison === MetricExplorerComparison.DIFFERENT_METRIC) {
            const compareMetricTimeDimensionFriendlyName = friendlyName(
                results?.compareMetric?.timeDimension?.field ?? '',
            );
            return (
                <Text>
                    X-axis is set to{' '}
                    <Text span fw={600}>
                        {metricTimeDimensionFriendlyName}
                    </Text>{' '}
                    and{' '}
                    <Text span fw={600}>
                        {compareMetricTimeDimensionFriendlyName}
                    </Text>
                    , as defined in the .yml files.
                </Text>
            );
        }

        return (
            <Text>
                X-axis is set to{' '}
                <Text span fw={600}>
                    {metricTimeDimensionFriendlyName}
                </Text>
                , as defined in the .yml file.
            </Text>
        );
    }, [
        query.comparison,
        results?.compareMetric?.timeDimension?.field,
        results?.metric.availableTimeDimensions,
        results?.metric.timeDimension?.field,
    ]);

    const splitSegments = useMemo(() => {
        return segmentedData.map((segment) => {
            const { data: segmentData, ...rest } = segment;
            const completedPeriodData: MetricExploreDataPointWithDateValue[] =
                [];
            const incompletePeriodData: MetricExploreDataPointWithDateValue[] =
                [];

            segmentData.forEach((row) => {
                if (
                    isInCurrentTimeFrame(
                        row.date,
                        results?.metric.timeDimension?.interval,
                    )
                ) {
                    incompletePeriodData.push(row);
                } else {
                    completedPeriodData.push(row);
                }
            });

            const lastCompletedPeriodDataPoint = completedPeriodData.sort(
                (a, b) => b.date.getTime() - a.date.getTime(),
            )[0];

            // Add the last completed period data to the incomplete period data, this will fill in the gap between the last completed period and the first incomplete period
            // Only do this if there is an incomplete period
            if (
                incompletePeriodData.length > 0 &&
                lastCompletedPeriodDataPoint
            ) {
                incompletePeriodData.push(lastCompletedPeriodDataPoint);
            }

            return {
                ...rest,
                completedPeriodData,
                incompletePeriodData,
            };
        });
    }, [results?.metric.timeDimension?.interval, segmentedData]);

    const compareMetricSplitSegment = useMemo(() => {
        const comparison = query.comparison;

        const emptySplitSegment = {
            segment: null,
            completedPeriodData: [],
            incompletePeriodData: [],
        };

        switch (comparison) {
            case MetricExplorerComparison.NONE:
                return emptySplitSegment;
            case MetricExplorerComparison.DIFFERENT_METRIC:
                return splitSegments[0] ?? emptySplitSegment; // Different metric data is always split as it has the same period of time
            case MetricExplorerComparison.PREVIOUS_PERIOD:
                const segment = segmentedData[0];

                return segment
                    ? {
                          ...segment,
                          completedPeriodData: segment.data, // Previous period data is always completed
                          incompletePeriodData: [],
                      }
                    : emptySplitSegment;
            default:
                return assertUnreachable(
                    comparison,
                    `Unsupported comparison: ${comparison}`,
                );
        }
    }, [query.comparison, segmentedData, splitSegments]);

    const chartCursor = useMemo<React.CSSProperties['cursor']>(() => {
        return zoomState.refAreaLeft || zoomState.refAreaRight
            ? 'grabbing'
            : 'default';
    }, [zoomState.refAreaLeft, zoomState.refAreaRight]);

    return (
        <Stack spacing="sm" w="100%" h="100%">
            <Group spacing="sm" noWrap>
                {dateRange && results?.metric.timeDimension && (
                    <MetricExploreDatePicker
                        dateRange={dateRange}
                        onChange={onDateRangeChange}
                        showTimeDimensionIntervalPicker={
                            showTimeDimensionIntervalPicker
                        }
                        isFetching={isFetching}
                        timeDimensionBaseField={timeDimensionBaseField}
                        setTimeDimensionOverride={setTimeDimensionOverride}
                        timeInterval={results.metric.timeDimension.interval}
                        onTimeIntervalChange={onTimeIntervalChange}
                    />
                )}

                <Tooltip
                    label="Drag between two points on the chart to zoom in. Use this button to reset the view."
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
            <Flex mih={0} sx={{ flex: 1, position: 'relative' }}>
                <LoadingOverlay
                    visible={isFetching}
                    loaderProps={{
                        size: 'sm',
                        color: 'dark',
                        variant: 'dots',
                    }}
                />
                {showEmptyState && <MetricsVisualizationEmptyState />}

                {!showEmptyState && results && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            ref={(instance) => {
                                setChartRef(instance);
                            }}
                            margin={{
                                right: 40,
                                left: 10,
                                top: 10,
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            style={{
                                cursor: chartCursor,
                            }}
                        >
                            {showLegend && (
                                <Legend
                                    verticalAlign="top"
                                    margin={{ bottom: 30 }}
                                    wrapperStyle={{
                                        height: 56,
                                        width: '100%',
                                        left: 0,
                                    }}
                                    content={
                                        <MetricExploreLegend
                                            legendConfig={legendConfig}
                                            comparison={query}
                                            getLegendProps={getLegendProps}
                                            onMouseEnter={setHoveringLegend}
                                            onMouseLeave={() => {
                                                setHoveringLegend(null);
                                            }}
                                            onClick={handleToggleLegend}
                                        />
                                    }
                                />
                            )}
                            <CartesianGrid
                                horizontal
                                vertical={false}
                                stroke={colors.ldGray[2]}
                                strokeDasharray="4 3"
                            />

                            <YAxis
                                // ! Adding dataKey on the axis will cause the scale to only reference the data in that key
                                // ! This is why we don't add it here we want the scale to depend on the data in the line
                                yAxisId="metric"
                                width={leftYAxisWidth}
                                {...commonYAxisConfig}
                                label={
                                    showLabel
                                        ? {
                                              value: results?.metric.label,
                                              angle: -90,
                                              position: 'left',
                                              // hardcoded value to align the label when the legend is shown
                                              dy: showLegend ? -25 : 0,
                                              style: {
                                                  textAnchor: 'middle',
                                                  fontSize: 14,
                                                  fill: colors.ldGray[8],
                                                  fontWeight: 500,
                                                  userSelect: 'none',
                                              },
                                          }
                                        : undefined
                                }
                                tickFormatter={(value) => {
                                    return formatItemValue(
                                        formatConfig.metric,
                                        value,
                                    );
                                }}
                                style={{
                                    userSelect: 'none',
                                    fill: colors.ldGray[8],
                                }}
                            />

                            <XAxis
                                dataKey="dateValue"
                                {...xAxisConfig}
                                axisLine={{ stroke: colors.ldGray[2] }}
                                tickLine={false}
                                fontSize={11}
                                style={{
                                    userSelect: 'none',
                                    fill: colors.ldGray[8],
                                }}
                                allowDuplicatedCategory={false}
                            />

                            <RechartsTooltip
                                content={
                                    <MetricExploreTooltip
                                        comparison={query}
                                        granularity={
                                            results.metric.timeDimension
                                                ?.interval
                                        }
                                        is5YearDateRangePreset={
                                            is5YearDateRangePreset
                                        }
                                        dateRange={dateRange}
                                        formatConfig={formatConfig}
                                    />
                                }
                                cursor={{
                                    stroke: colors.gray[4],
                                }}
                                isAnimationActive={false}
                            />

                            {splitSegments.flatMap((segment) => {
                                const key = segment.segment ?? 'metric';
                                const completedPeriodKey = `${key}-completed-period`;
                                const incompletePeriodKey = `${key}-incomplete-period`;

                                return [
                                    <Line
                                        key={completedPeriodKey}
                                        {...getLineProps(key)}
                                        type="linear"
                                        yAxisId="metric"
                                        data={segment.completedPeriodData}
                                        dataKey="metric.value"
                                        stroke={segment.color}
                                        dot={false}
                                        legendType="plainline"
                                        isAnimationActive={false}
                                    />,
                                    <Line
                                        key={incompletePeriodKey}
                                        {...getLineProps(key)}
                                        type="linear"
                                        yAxisId="metric"
                                        data={segment.incompletePeriodData}
                                        dataKey="metric.value"
                                        stroke={segment.color}
                                        dot={false}
                                        legendType="none" // Don't render legend for the incomplete period line
                                        isAnimationActive={false}
                                        opacity={COMPARISON_OPACITY}
                                        strokeDasharray="3 4"
                                    />,
                                ];
                            })}

                            {results.compareMetric && (
                                <>
                                    {shouldSplitYAxis && (
                                        <YAxis
                                            // ! Adding dataKey on the axis will cause the scale to only reference the data in that key
                                            // ! This is why we don't add it here we want the scale to depend on the data in the line
                                            yAxisId="compareMetric"
                                            orientation="right"
                                            width={rightYAxisWidth}
                                            {...commonYAxisConfig}
                                            tickFormatter={(value) => {
                                                return formatItemValue(
                                                    formatConfig.compareMetric ??
                                                        undefined,
                                                    value,
                                                );
                                            }}
                                            style={{ userSelect: 'none' }}
                                        />
                                    )}

                                    <Line
                                        {...getLineProps('compareMetric')}
                                        yAxisId={
                                            shouldSplitYAxis
                                                ? 'compareMetric'
                                                : 'metric'
                                        }
                                        type="linear"
                                        dataKey="compareMetric.value"
                                        data={
                                            compareMetricSplitSegment.completedPeriodData
                                        }
                                        stroke={
                                            query.comparison ===
                                            MetricExplorerComparison.DIFFERENT_METRIC
                                                ? colors.teal[5]
                                                : colors.indigo[4]
                                        }
                                        dot={false}
                                        legendType="plainline"
                                        isAnimationActive={false}
                                        opacity={
                                            query.comparison ===
                                            MetricExplorerComparison.DIFFERENT_METRIC
                                                ? 1
                                                : COMPARISON_OPACITY
                                        }
                                    />
                                    <Line
                                        {...getLineProps('compareMetric')}
                                        yAxisId={
                                            shouldSplitYAxis
                                                ? 'compareMetric'
                                                : 'metric'
                                        }
                                        type="linear"
                                        dataKey="compareMetric.value"
                                        data={
                                            compareMetricSplitSegment.incompletePeriodData
                                        }
                                        stroke={
                                            query.comparison ===
                                            MetricExplorerComparison.DIFFERENT_METRIC
                                                ? colors.teal[9]
                                                : colors.indigo[9]
                                        }
                                        dot={false}
                                        legendType="none" // Don't render legend for the incomplete period line
                                        isAnimationActive={false}
                                        opacity={COMPARISON_OPACITY}
                                        strokeDasharray="3 4"
                                    />
                                </>
                            )}

                            {zoomState.refAreaLeft &&
                                zoomState.refAreaRight && (
                                    <ReferenceArea
                                        yAxisId={'metric'}
                                        x1={zoomState.refAreaLeft}
                                        x2={zoomState.refAreaRight}
                                        strokeOpacity={COMPARISON_OPACITY}
                                        fill={colors.gray[3]}
                                    />
                                )}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </Flex>
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
                        label={timeDimensionTooltipLabel}
                        disabled={!timeDimensionTooltipLabel}
                    >
                        <Text fw={500} c="ldGray.7" fz={14}>
                            Date ({capitalize(timeDimensionBaseField.interval)})
                        </Text>
                    </Tooltip>

                    {results?.metric.availableTimeDimensions && (
                        <Tooltip
                            variant="xs"
                            disabled={!canManageExplore}
                            label="Define a default x-axis in your .yml file to skip this step and simplify the experience for your users"
                            position="right"
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
