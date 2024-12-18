import {
    applyCustomFormat,
    capitalize,
    ComparisonFormatTypes,
    friendlyName,
    getCustomFormat,
    MetricExplorerComparison,
    TimeFrames,
    type MetricExploreDataPointWithDateValue,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type MetricsExplorerQueryResults,
    type TimeDimensionConfig,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Divider,
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
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
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
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useDynamicYAxisWidth } from '../../hooks/useDynamicYAxisWidth';
import {
    getGranularityLabel,
    getGranularitySublabel,
    is5YearDateRange,
} from '../../utils/metricPeekDate';
import { MetricPeekDatePicker } from '../MetricPeekDatePicker';
import { MetricsVisualizationEmptyState } from '../MetricsVisualizationEmptyState';
import { MetricExploreLegend } from './MetricExploreLegend';
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
    comparison: MetricExplorerQuery;
    granularity: TimeFrames | undefined;
    is5YearDateRangePreset: boolean;
    payload?: CustomTooltipPropsPayload[];
    dateRange?: MetricExplorerDateRange;
}

const SquareBadge = ({ color }: { color?: DefaultMantineColor }) => (
    <Box
        sx={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: color ?? 'indigo.6',
        }}
    />
);

const CustomTooltipPayloadEntry = ({
    entry,
    color,
    comparison,
    date,
    is5YearDateRangePreset,
    dateRange,
}: {
    entry: CustomTooltipPropsPayload;
    color?: DefaultMantineColor;
    comparison: MetricExplorerQuery;
    date: string | undefined;
    is5YearDateRangePreset: boolean;
    dateRange?: MetricExplorerDateRange;
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

    if (
        comparison.comparison === MetricExplorerComparison.NONE &&
        comparison.segmentDimension === null
    ) {
        return (
            <Badge
                variant="light"
                color="indigo"
                radius="md"
                sx={(theme) => ({
                    border: `1px solid ${theme.colors.indigo[1]}`,
                })}
                h={24}
            >
                {entryData.formatted}
            </Badge>
        );
    }

    if (comparison.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
        const currentPeriodYear = dateRange ? dayjs(dateRange[1]).year() : null;
        const startYear = dateRange ? dayjs(dateRange[0]).year() : null;

        let label = getGranularitySublabel(entry.name, date);

        if (is5YearDateRangePreset && startYear && currentPeriodYear) {
            label =
                entry.name === 'metric'
                    ? `${startYear}-${currentPeriodYear}`
                    : `${startYear - 1}-${currentPeriodYear - 1}`;
        }

        return (
            <>
                <Group position="apart">
                    <Group spacing={4}>
                        <MantineIcon
                            color={color ?? 'indigo.6'}
                            icon={
                                entry.name === 'metric'
                                    ? IconMinus
                                    : IconLineDashed
                            }
                        />
                        <Text c="gray.8" fz={13} fw={500}>
                            {label}
                        </Text>
                    </Group>

                    <Badge
                        variant="light"
                        color="gray.7"
                        radius="md"
                        h={24}
                        sx={(theme) => ({
                            border: `1px solid ${theme.colors.gray[1]}`,
                            fontFeatureSettings: '"tnum"',
                        })}
                    >
                        {entryData.formatted}
                    </Badge>
                </Group>
            </>
        );
    }

    if (
        comparison.comparison === MetricExplorerComparison.NONE &&
        comparison.segmentDimension !== null
    ) {
        return (
            <Group position="apart">
                <Group spacing={4}>
                    <SquareBadge color={color} />
                    <Text c="gray.8" fz={13} fw={500}>
                        {entryData.label}
                    </Text>
                </Group>

                <Badge
                    variant="light"
                    color="gray"
                    radius="md"
                    h={24}
                    sx={(theme) => ({
                        border: `1px solid ${theme.colors.gray[1]}`,
                        color: theme.colors.gray[7],
                    })}
                >
                    {entryData.formatted}
                </Badge>
            </Group>
        );
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
                color="gray.7"
                radius="md"
                h={24}
                sx={(theme) => ({
                    border: `1px solid ${theme.colors.gray[1]}`,
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

const PercentageChangeFooter: FC<{
    uniqueEntries: CustomTooltipPropsPayload[];
    comparison: MetricExplorerComparison;
}> = ({ uniqueEntries, comparison }) => {
    if (comparison !== MetricExplorerComparison.PREVIOUS_PERIOD) return null;

    if (
        !uniqueEntries[0]?.payload.metric?.value ||
        !uniqueEntries[0]?.payload.compareMetric?.value
    ) {
        return null;
    }

    const percentChange =
        calculateComparisonValue(
            uniqueEntries[0].payload.metric.value,
            uniqueEntries[0].payload.compareMetric.value,
            ComparisonFormatTypes.PERCENTAGE,
        ) * 100;

    const changeColor =
        percentChange > 0 ? 'green.7' : percentChange < 0 ? 'red.7' : 'dark.4';

    return (
        <Group position="right" spacing={4}>
            <Text c="gray.7" fz={11} fw={500}>
                Change:
            </Text>
            <Text
                c={changeColor}
                fz={11}
                fw={500}
                ta="right"
                sx={{ fontFeatureSettings: '"tnum"' }}
            >
                {percentChange > 0 ? '+' : ''}
                {percentChange.toFixed(1)}%
            </Text>
        </Group>
    );
};

const CustomTooltip = ({
    active,
    payload,
    label,
    comparison,
    granularity,
    is5YearDateRangePreset,
    dateRange,
}: CustomTooltipProps & { dateRange?: MetricExplorerDateRange }) => {
    const hasNoComparison =
        comparison.comparison === MetricExplorerComparison.NONE;
    const isSegmented = hasNoComparison && comparison.segmentDimension !== null;
    const showFullDate =
        hasNoComparison ||
        comparison.comparison === MetricExplorerComparison.DIFFERENT_METRIC ||
        is5YearDateRangePreset;

    const uniqueEntries = useMemo(() => {
        return uniqBy(payload, getUniqueEntryKey).filter((entry) =>
            isSegmented && entry.payload.segment
                ? entry.name === entry.payload.segment
                : true,
        );
    }, [payload, isSegmented]);

    if (!active || !uniqueEntries || !uniqueEntries.length) {
        return null;
    }

    const dateLabel = getGranularityLabel(label, granularity, showFullDate);
    let showDateLabel = false;

    switch (comparison.comparison) {
        case MetricExplorerComparison.NONE:
            showDateLabel = true;
            break;
        case MetricExplorerComparison.PREVIOUS_PERIOD:
            showDateLabel =
                granularity !== TimeFrames.YEAR || is5YearDateRangePreset;
            break;
        case MetricExplorerComparison.DIFFERENT_METRIC:
            showDateLabel = true;
            break;
    }

    return (
        <Stack
            miw={200}
            fz={13}
            fw={500}
            p="sm"
            spacing="xs"
            sx={(theme) => ({
                backgroundColor: 'white',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.gray[2]}`,
                boxShadow:
                    '0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25)',
                flexDirection:
                    comparison.comparison === MetricExplorerComparison.NONE &&
                    comparison.segmentDimension === null
                        ? 'row'
                        : 'column',
                justifyContent:
                    comparison.comparison === MetricExplorerComparison.NONE &&
                    comparison.segmentDimension === null
                        ? 'space-between'
                        : 'flex-start',
                alignItems:
                    comparison.comparison === MetricExplorerComparison.NONE &&
                    comparison.segmentDimension === null
                        ? 'center'
                        : 'initial',
            })}
        >
            {showDateLabel && (
                <>
                    <Text c="gray.7" fz={13} fw={500}>
                        {dateLabel}
                    </Text>
                    <Divider color="gray.2" />
                </>
            )}
            {uniqueEntries.map((entry) => (
                <CustomTooltipPayloadEntry
                    key={getUniqueEntryKey(entry)}
                    date={label}
                    is5YearDateRangePreset={is5YearDateRangePreset}
                    entry={entry}
                    color={entry.stroke}
                    comparison={comparison}
                    dateRange={dateRange}
                />
            ))}
            <PercentageChangeFooter
                uniqueEntries={uniqueEntries}
                comparison={comparison.comparison}
            />
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

                const currentPeriodYear = dateRange
                    ? dayjs(dateRange[1]).year()
                    : null;
                const startYear = dateRange ? dayjs(dateRange[0]).year() : null;

                // If the date range is 5 years, we want to show the year range
                if (is5YearDateRangePreset && startYear && currentPeriodYear) {
                    return {
                        metric: {
                            name: 'metric',
                            label: `${startYear}-${currentPeriodYear}`,
                        },
                        compareMetric: {
                            name: 'compareMetric',
                            label: `${startYear - 1}-${currentPeriodYear - 1}`,
                        },
                    };
                }

                return {
                    metric: {
                        name: 'metric',
                        label: currentPeriodYear
                            ? `${currentPeriodYear}`
                            : results?.metric.label,
                    },
                    compareMetric: {
                        name: 'compareMetric',
                        label: currentPeriodYear
                            ? `${currentPeriodYear - 1}`
                            : results?.compareMetric?.label,
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

    const formatConfig = useMemo(() => {
        return {
            metric: getCustomFormat(results?.metric),
            compareMetric: getCustomFormat(results?.compareMetric ?? undefined),
        };
    }, [results]);

    const shouldSplitYAxis = useMemo(() => {
        return (
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
            formatConfig.compareMetric !== formatConfig.metric
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
                opacity = name === hoveringLegend ? 1 : 0.3;
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
                        : 0.3,
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
                <Flex mih={0} sx={{ flex: 1, position: 'relative' }}>
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
                                    margin={{ bottom: 30 }}
                                    wrapperStyle={{
                                        height: 56,
                                        width: '100%',
                                        left: 0,
                                    }}
                                    content={
                                        <MetricExploreLegend
                                            legendConfig={legendConfig}
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
                                stroke={colors.gray[2]}
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
                                                  fill: colors.gray[7],
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
                                allowDuplicatedCategory={false}
                            />

                            <RechartsTooltip
                                content={
                                    <CustomTooltip
                                        comparison={query}
                                        granularity={
                                            results.metric.timeDimension
                                                ?.interval
                                        }
                                        is5YearDateRangePreset={
                                            is5YearDateRangePreset
                                        }
                                        dateRange={dateRange}
                                    />
                                }
                                cursor={{
                                    stroke: colors.gray[4],
                                }}
                                isAnimationActive={false}
                            />

                            {segmentedData.map((segment) => (
                                <Line
                                    key={segment.segment ?? 'metric'}
                                    {...getLineProps(
                                        segment.segment ?? 'metric',
                                    )}
                                    type="linear"
                                    yAxisId="metric"
                                    data={segment.data}
                                    dataKey="metric.value"
                                    stroke={segment.color}
                                    dot={false}
                                    legendType="plainline"
                                    isAnimationActive={false}
                                />
                            ))}

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
                                                return applyCustomFormat(
                                                    value,
                                                    formatConfig.compareMetric,
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
                                        data={segmentedData[0].data}
                                        stroke={colors.indigo[9]}
                                        strokeDasharray={'3 4'}
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
                        label={timeDimensionTooltipLabel}
                        disabled={!timeDimensionTooltipLabel}
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
