import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    friendlyName,
    getDefaultMetricTreeNodeDateRange,
    MetricTotalComparisonType,
    type TimeFrames,
} from '@lightdash/common';
import {
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconInfoCircle,
} from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useRunMetricTotal } from '../../hooks/useRunMetricExplorerQuery';

export type MetricTreeExpandedNodeData = Node<{
    label: string;
    tableName: string;
    metricName: string;
    isEdgeTarget?: boolean;
    isEdgeSource?: boolean;
    timeFrame: TimeFrames;
}>;

const MetricTreeExpandedNode: React.FC<
    NodeProps<MetricTreeExpandedNodeData>
> = ({ data, isConnectable, selected }) => {
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
        comparisonType: MetricTotalComparisonType.PREVIOUS_PERIOD,
        dateRange,
        options: {
            enabled: Boolean(projectUuid && dateRange),
        },
    });

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

    const compareString = useMemo(
        () =>
            totalQuery.data?.value &&
            totalQuery.data?.comparisonValue &&
            `Compared to previous ${data.timeFrame.toLowerCase()}`,
        [totalQuery.data, data.timeFrame],
    ); // TODO: will it always be prev month?

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
                '&[data-with-border]': {
                    backgroundColor: 'white',
                    borderRadius: theme.radius.md,
                    border: `1px solid ${
                        selected ? theme.colors.blue[5] : theme.colors.gray[3]
                    }`,
                },
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack key={data.label} spacing="xs">
                <Group>
                    <Title order={6}>{title}</Title>
                    <Tooltip
                        label={
                            <>
                                <Text size="xs" fw="bold">
                                    Table:{' '}
                                    <Text span fw="normal">
                                        {data.tableName}
                                    </Text>
                                </Text>
                            </>
                        }
                    >
                        <MantineIcon
                            icon={IconInfoCircle}
                            size={12}
                            color="gray.7"
                        />
                    </Tooltip>
                </Group>

                {totalQuery.isFetching ? (
                    <Loader size="xs" color="gray.5" />
                ) : (
                    <Stack spacing="two">
                        <Group position="apart">
                            <Text fz="md" fw={700}>
                                {formattedValue}
                            </Text>
                            {change && (
                                <Group
                                    spacing={1}
                                    c={change > 0 ? 'green.7' : 'red.6'}
                                >
                                    <Text fz="sm" fw={500}>
                                        {formattedChange}
                                    </Text>
                                    <MantineIcon
                                        icon={
                                            change > 0
                                                ? IconArrowUp
                                                : IconArrowDown
                                        }
                                        size={12}
                                        stroke={1.8}
                                    />
                                </Group>
                            )}
                        </Group>

                        {change && (
                            <Text fz={11} c="gray.6">
                                {compareString}
                            </Text>
                        )}
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

export default MetricTreeExpandedNode;
