import {
    ComparisonFormatTypes,
    MetricExplorerComparison,
    TimeFrames,
    formatItemValue,
    type MetricExploreDataPointWithDateValue,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    type DefaultMantineColor,
} from '@mantine/core';
import dayjs from 'dayjs';
import uniqBy from 'lodash/uniqBy';
import { memo, useMemo, type FC } from 'react';
import { type TooltipProps } from 'recharts';
import {
    type NameType,
    type ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
import {
    getGranularityLabel,
    getGranularitySublabel,
} from '../../utils/metricExploreDate';
import {
    COMPARISON_OPACITY,
    type MetricVisualizationFormatConfig,
} from './types';

type RechartsTooltipPropsPayload = NonNullable<
    TooltipProps<ValueType, NameType>['payload']
>[number];

interface CustomTooltipPropsPayload extends RechartsTooltipPropsPayload {
    payload: MetricExploreDataPointWithDateValue;
}

interface MetricExploreTooltipProps extends TooltipProps<ValueType, NameType> {
    comparison: MetricExplorerQuery;
    granularity: TimeFrames | undefined;
    is5YearDateRangePreset: boolean;
    payload?: CustomTooltipPropsPayload[];
    dateRange?: MetricExplorerDateRange;
    formatConfig: MetricVisualizationFormatConfig;
}

/**
 * Unique key for each entry in the tooltip
 * @param entry - The entry to get the key for
 * @returns - The unique key
 */
const getUniqueEntryKey = (entry: CustomTooltipPropsPayload): string =>
    `${entry.name}_${entry.payload.segment}_${entry.payload.dateValue}_${entry.payload.metric.value}`;

/**
 * Whether to show the date label in the tooltip
 * @param comparisonType - The type of comparison
 * @param granularity - The granularity of the data
 * @param is5YearDateRangePreset - Whether the date range is a 5 year preset
 * @returns - Whether to show the date label
 */
const shouldShowDateLabel = (
    comparisonType: MetricExplorerComparison,
    granularity: TimeFrames | undefined,
    is5YearDateRangePreset: boolean,
): boolean => {
    switch (comparisonType) {
        case MetricExplorerComparison.NONE:
        case MetricExplorerComparison.DIFFERENT_METRIC:
            return true;
        case MetricExplorerComparison.PREVIOUS_PERIOD:
            return granularity !== TimeFrames.YEAR || is5YearDateRangePreset;
        default:
            return false;
    }
};
const TooltipBadge: FC<{
    value: string | null;
    color?: DefaultMantineColor;
    variant?: 'default' | 'comparison';
}> = ({ value, color = 'indigo', variant = 'default' }) => (
    <Badge
        variant="light"
        color={variant === 'comparison' ? 'ldGray.9' : color}
        radius="md"
        h={24}
        sx={(theme) => ({
            border: `1px solid ${
                theme.colors[variant === 'comparison' ? 'ldGray' : color][2]
            }`,
            fontFeatureSettings: '"tnum"',
        })}
    >
        {value}
    </Badge>
);

export const SquareBadge: FC<{
    color?: DefaultMantineColor;
    size?: number;
    opacity?: number;
}> = ({ color, size = 10, opacity = 1 }) => (
    <Box
        sx={{
            width: size,
            height: size,
            borderRadius: 2,
            backgroundColor: color ?? 'indigo.6',
            opacity,
        }}
    />
);

const TooltipContainer: FC<{
    children: React.ReactNode;
    layout?: 'row' | 'column';
}> = memo(({ children, layout = 'column' }) => (
    <Stack
        miw={200}
        fz={13}
        fw={500}
        p="sm"
        spacing="xs"
        sx={(theme) => ({
            backgroundColor: theme.colors.background[0],
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.ldGray[2]}`,
            boxShadow:
                '0px 8px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.25)',
            flexDirection: layout,
            justifyContent: layout === 'row' ? 'space-between' : 'flex-start',
            alignItems: layout === 'row' ? 'center' : 'initial',
        })}
    >
        {children}
    </Stack>
));

const getTooltipDisplayType = (comparison: MetricExplorerQuery) => {
    if (
        comparison.comparison === MetricExplorerComparison.NONE &&
        !comparison.segmentDimension
    ) {
        return 'simple';
    }
    if (comparison.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
        return 'previousPeriod';
    }
    if (
        comparison.comparison === MetricExplorerComparison.NONE &&
        comparison.segmentDimension
    ) {
        return 'segmented';
    }
    return 'default';
};

const SimpleTooltip: FC<{ value: string | null }> = ({ value }) => (
    <TooltipBadge value={value} />
);

const PreviousPeriodTooltip: FC<{
    entry: CustomTooltipPropsPayload;
    color?: DefaultMantineColor;
    date: string | undefined;
    is5YearDateRangePreset: boolean;
    dateRange?: MetricExplorerDateRange;
    formattedValue: string;
}> = ({
    entry,
    color,
    date,
    is5YearDateRangePreset,
    dateRange,
    formattedValue,
}) => {
    const currentPeriodYear = dateRange ? dayjs(dateRange[1]).year() : null;
    const startYear = dateRange ? dayjs(dateRange[0]).year() : null;

    let label = getGranularitySublabel(entry.name, date);
    if (is5YearDateRangePreset && startYear && currentPeriodYear) {
        label =
            entry.name === 'metric'
                ? `${startYear}-${currentPeriodYear}`
                : `${startYear - 1}-${currentPeriodYear - 1}`;
    }

    const opacity = entry.name === 'compareMetric' ? COMPARISON_OPACITY : 1;

    return (
        <Group position="apart">
            <Group spacing={4}>
                <SquareBadge
                    color={color ?? 'indigo.6'}
                    size={12}
                    opacity={opacity}
                />
                <Text c="ldGray.8" fz={13} fw={500}>
                    {label}
                </Text>
            </Group>
            <TooltipBadge value={formattedValue} variant="comparison" />
        </Group>
    );
};

const TooltipEntry: FC<{
    entry: CustomTooltipPropsPayload;
    color?: DefaultMantineColor;
    comparison: MetricExplorerQuery;
    date: string | undefined;
    is5YearDateRangePreset: boolean;
    formatConfig: MetricVisualizationFormatConfig;
    dateRange?: MetricExplorerDateRange;
}> = (props) => {
    const { entry } = props;

    const entryData = useMemo(() => {
        if (!entry.name) return null;
        return entry.name === 'compareMetric'
            ? entry.payload.compareMetric
            : entry.payload.metric;
    }, [entry]);

    const formattedValue = useMemo(() => {
        if (entry.name === 'metric') {
            return formatItemValue(props.formatConfig.metric, entryData?.value);
        }
        return formatItemValue(
            props.formatConfig.compareMetric ?? undefined,
            entryData?.value,
        );
    }, [
        entry.name,
        entryData?.value,
        props.formatConfig.metric,
        props.formatConfig.compareMetric,
    ]);

    if (!entryData) return null;

    const displayType = getTooltipDisplayType(props.comparison);

    switch (displayType) {
        case 'simple':
            return <SimpleTooltip value={formattedValue} />;
        case 'previousPeriod':
            return (
                <PreviousPeriodTooltip
                    {...props}
                    formattedValue={formattedValue}
                />
            );
        case 'segmented':
            return (
                <Group position="apart">
                    <Group spacing={4}>
                        <SquareBadge color={props.color} />
                        <Text c="ldGray.8" fz={13} fw={500}>
                            {entryData.label}
                        </Text>
                    </Group>
                    <TooltipBadge value={formattedValue} variant="comparison" />
                </Group>
            );
        default:
            return (
                <Group position="apart">
                    <Group spacing={4}>
                        <SquareBadge color={props.color} size={12} />
                        {/* <MantineIcon
                            color={props.color ?? 'indigo.6'}
                            icon={IconMinus}
                            opacity={
                                entry.name === 'compareMetric'
                                    ? COMPARISON_OPACITY
                                    : 1
                            }
                        /> */}
                        <Text c="ldGray.8" fz={13} fw={500}>
                            {entryData.label}
                        </Text>
                    </Group>
                    <TooltipBadge value={formattedValue} variant="comparison" />
                </Group>
            );
    }
};

const PercentageChangeFooter: FC<{
    uniqueEntries: CustomTooltipPropsPayload[];
    comparison: MetricExplorerComparison;
}> = ({ uniqueEntries, comparison }) => {
    if (comparison !== MetricExplorerComparison.PREVIOUS_PERIOD) return null;

    const metricValue = uniqueEntries[0]?.payload.metric?.value;
    const compareValue = uniqueEntries[0]?.payload.compareMetric?.value;
    if (!metricValue || !compareValue) return null;

    const percentChange =
        calculateComparisonValue(
            metricValue,
            compareValue,
            ComparisonFormatTypes.PERCENTAGE,
        ) * 100;

    const changeColor =
        percentChange > 0
            ? 'green.7'
            : percentChange < 0
            ? 'red.7'
            : 'ldDark.4';

    return (
        <Group position="right" spacing={4}>
            <Text c="ldGray.7" fz={11} fw={500}>
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

export const MetricExploreTooltip: FC<MetricExploreTooltipProps> = ({
    active,
    payload,
    label,
    comparison,
    granularity,
    is5YearDateRangePreset,
    dateRange,
    formatConfig,
}) => {
    const hasNoComparison =
        comparison.comparison === MetricExplorerComparison.NONE;
    const isSegmented = hasNoComparison && comparison.segmentDimension !== null;
    const showFullDate =
        hasNoComparison ||
        comparison.comparison === MetricExplorerComparison.DIFFERENT_METRIC ||
        is5YearDateRangePreset;

    const uniqueEntries = useMemo(
        () =>
            uniqBy(payload, getUniqueEntryKey).filter((entry) =>
                isSegmented && entry.payload.segment
                    ? entry.name === entry.payload.segment
                    : true,
            ),
        [payload, isSegmented],
    );

    if (!active || !uniqueEntries?.length) return null;

    const dateLabel = getGranularityLabel(label, granularity, showFullDate);
    const showDateLabel = shouldShowDateLabel(
        comparison.comparison,
        granularity,
        is5YearDateRangePreset,
    );

    return (
        <TooltipContainer
            layout={
                hasNoComparison && !comparison.segmentDimension
                    ? 'row'
                    : 'column'
            }
        >
            {showDateLabel && (
                <>
                    <Text c="ldGray.7" fz={13} fw={500}>
                        {dateLabel}
                    </Text>
                    <Divider color="ldGray.2" />
                </>
            )}

            {uniqueEntries.map((entry) => (
                <TooltipEntry
                    key={getUniqueEntryKey(entry)}
                    entry={entry}
                    color={entry.stroke}
                    comparison={comparison}
                    date={label}
                    is5YearDateRangePreset={is5YearDateRangePreset}
                    dateRange={dateRange}
                    formatConfig={formatConfig}
                />
            ))}

            <PercentageChangeFooter
                uniqueEntries={uniqueEntries}
                comparison={comparison.comparison}
            />
        </TooltipContainer>
    );
};
