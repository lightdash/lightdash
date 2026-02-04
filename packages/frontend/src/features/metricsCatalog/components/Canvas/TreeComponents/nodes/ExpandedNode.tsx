import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    friendlyName,
    getDefaultMetricTreeNodeDateRange,
    getRollingPeriodDates,
    MetricTotalComparisonType,
    TimeFrames,
} from '@lightdash/common';
import {
    Badge,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { calculateComparisonValue } from '../../../../../../hooks/useBigNumberConfig';
import { useAppSelector } from '../../../../../sqlRunner/store/hooks';
import { useRunMetricTotal } from '../../../../hooks/useRunMetricExplorerQuery';
import { MetricDetailPopover } from '../../../MetricDetailPopover';
import classes from './ChangeIndicator.module.css';

const getComparisonLabel = (
    timeFrame: TimeFrames,
    rollingDays?: number,
): string => {
    if (rollingDays) {
        return `Last ${rollingDays} days vs. previous ${rollingDays} days`;
    }
    switch (timeFrame) {
        case TimeFrames.DAY:
            return 'Current day vs. last day to date';
        case TimeFrames.WEEK:
            return 'Current week vs. last week to date';
        case TimeFrames.MONTH:
            return 'Current month vs. last month to date';
        case TimeFrames.YEAR:
            return 'Current year vs. last year to date';
        default:
            return 'Current vs. previous period';
    }
};

const getVariant = (change: number): 'positive' | 'negative' | 'neutral' => {
    if (change === 0) return 'neutral';
    return change > 0 ? 'positive' : 'negative';
};

const ChangeIndicator: FC<{
    change: number;
    formattedChange: string;
    timeFrame: TimeFrames;
    rollingDays?: number;
}> = ({ change, formattedChange, timeFrame, rollingDays }) => {
    const variant = useMemo(() => getVariant(change), [change]);

    return (
        <Tooltip
            position="bottom"
            label={getComparisonLabel(timeFrame, rollingDays)}
            withinPortal
        >
            <Badge
                fz={13}
                fw={500}
                size="lg"
                radius="md"
                py="two"
                px="xs"
                variant="transparent"
                className={classes.badge}
                data-variant={variant}
            >
                {formattedChange}
            </Badge>
        </Tooltip>
    );
};

export type ExpandedNodeData = Node<{
    label: string;
    tableName: string;
    metricName: string;
    isEdgeTarget?: boolean;
    isEdgeSource?: boolean;
    timeFrame: TimeFrames;
    rollingDays?: number; // When set, uses ROLLING_DAYS comparison instead of calendar-based
}>;

const ExpandedNode: React.FC<NodeProps<ExpandedNodeData>> = ({
    data,
    isConnectable,
    selected,
}) => {
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    // For rolling periods, we calculate a date range that covers both periods
    // The server will use rollingDays to calculate the exact periods
    const dateRange = useMemo(() => {
        if (data.rollingDays) {
            const { current, previous } = getRollingPeriodDates(
                data.rollingDays,
            );
            return [previous.start.toDate(), current.end.toDate()] as [
                Date,
                Date,
            ];
        }
        return getDefaultMetricTreeNodeDateRange(data.timeFrame);
    }, [data.timeFrame, data.rollingDays]);

    const comparisonType = data.rollingDays
        ? MetricTotalComparisonType.ROLLING_DAYS
        : MetricTotalComparisonType.PREVIOUS_PERIOD;

    const totalQuery = useRunMetricTotal({
        projectUuid,
        exploreName: data.tableName,
        metricName: data.metricName,
        timeFrame: data.timeFrame,
        granularity: data.timeFrame,
        comparisonType,
        rollingDays: data.rollingDays,
        dateRange,
        options: {
            enabled: Boolean(projectUuid && dateRange),
        },
    });

    const compiledQueryConfig = useMemo(
        () =>
            dateRange
                ? {
                      timeFrame: data.timeFrame,
                      granularity: data.timeFrame,
                      comparisonType,
                      dateRange,
                      rollingDays: data.rollingDays,
                  }
                : undefined,
        [data.timeFrame, dateRange, comparisonType, data.rollingDays],
    );

    const change = useMemo(() => {
        const value = totalQuery.data?.value;
        const compareValue = totalQuery.data?.comparisonValue;

        if (value && compareValue) {
            return calculateComparisonValue(
                Number(value),
                Number(compareValue),
                ComparisonFormatTypes.PERCENTAGE,
            );
        }
    }, [totalQuery.data]);

    const formattedChange = useMemo(() => {
        if (change) {
            return applyCustomFormat(change, {
                round: 2,
                type: CustomFormatType.PERCENT,
            });
        }

        return '-';
    }, [change]);

    const formattedValue = useMemo(() => {
        if (totalQuery.data) {
            return formatItemValue(
                totalQuery.data.metric,
                totalQuery.data.value,
            );
        }
        return '-';
    }, [totalQuery.data]);

    return (
        <Paper
            p="md"
            fz={14}
            withBorder
            style={(theme) => ({
                borderColor: selected
                    ? theme.colors.blue[5]
                    : theme.colors.ldGray[3],
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack key={data.label} gap="xs">
                <Group justify="space-between">
                    <Title fz={14} fw={500} c="ldGray.7">
                        {title}
                    </Title>
                    {projectUuid && (
                        <MetricDetailPopover
                            projectUuid={projectUuid}
                            tableName={data.tableName}
                            metricName={data.metricName}
                            compiledQueryConfig={compiledQueryConfig}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                size={12}
                                color="ldGray.5"
                            />
                        </MetricDetailPopover>
                    )}
                </Group>

                <Stack gap="xxs">
                    <Skeleton visible={totalQuery.isFetching}>
                        <Group justify="space-between">
                            <Text fz={24} fw={500} c="ldGray.8">
                                {formattedValue}
                            </Text>
                            {change && (
                                <ChangeIndicator
                                    change={change}
                                    formattedChange={formattedChange}
                                    timeFrame={data.timeFrame}
                                    rollingDays={data.rollingDays}
                                />
                            )}
                        </Group>
                    </Skeleton>
                </Stack>
            </Stack>
            <Handle
                type="source"
                position={Position.Bottom}
                hidden={!isConnectable && !data.isEdgeSource}
            />
        </Paper>
    );
};

export default ExpandedNode;
