import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    friendlyName,
    getDefaultMetricTreeNodeDateRange,
    MetricTotalComparisonType,
    TimeFrames,
} from '@lightdash/common';
import {
    Badge,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { calculateComparisonValue } from '../../../../../../hooks/useBigNumberConfig';
import { useAppSelector } from '../../../../../sqlRunner/store/hooks';
import { useRunMetricTotal } from '../../../../hooks/useRunMetricExplorerQuery';
import { useChangeIndicatorStyles } from '../../../../styles/useChangeIndicatorStyles';
import { MetricDetailPopover } from '../../../MetricDetailPopover';

const getComparisonLabel = (timeFrame: TimeFrames) => {
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

const ChangeIndicator: FC<{
    change: number;
    formattedChange: string;
    timeFrame: TimeFrames;
}> = ({ change, formattedChange, timeFrame }) => {
    const { classes } = useChangeIndicatorStyles();
    const indicatorClasses = useMemo(() => {
        if (change === 0) {
            return classes.neutral;
        }
        return change > 0 ? classes.positive : classes.negative;
    }, [change, classes]);

    return (
        <Tooltip
            position="bottom"
            label={getComparisonLabel(timeFrame)}
            withinPortal
        >
            <Badge
                fz={13}
                fw={500}
                size="lg"
                radius="md"
                py="two"
                px="xs"
                className={indicatorClasses}
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

    const dateRange = useMemo(
        () => getDefaultMetricTreeNodeDateRange(data.timeFrame),
        [data.timeFrame],
    );

    const totalQuery = useRunMetricTotal({
        projectUuid,
        exploreName: data.tableName,
        metricName: data.metricName,
        timeFrame: data.timeFrame,
        granularity: data.timeFrame,
        comparisonType: MetricTotalComparisonType.PREVIOUS_PERIOD,
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
                      comparisonType: MetricTotalComparisonType.PREVIOUS_PERIOD,
                      dateRange,
                  }
                : undefined,
        [data.timeFrame, dateRange],
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
            sx={(theme) => ({
                backgroundColor: theme.colors.background[0],
                borderRadius: theme.radius.md,
                border: `1px solid ${
                    selected ? theme.colors.blue[5] : theme.colors.ldGray[3]
                }`,
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack key={data.label} spacing="xs">
                <Group>
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
                                color="ldGray.7"
                            />
                        </MetricDetailPopover>
                    )}
                </Group>

                {totalQuery.isFetching ? (
                    <Loader size="xs" color="ldGray.5" />
                ) : (
                    <Stack spacing="two">
                        <Group position="apart">
                            <Text fz={24} fw={500} c="ldGray.8">
                                {formattedValue}
                            </Text>
                            {change && (
                                <ChangeIndicator
                                    change={change}
                                    formattedChange={formattedChange}
                                    timeFrame={data.timeFrame}
                                />
                            )}
                        </Group>
                    </Stack>
                )}
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
