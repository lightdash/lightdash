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
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useRunMetricTotal } from '../../hooks/useRunMetricExplorerQuery';

export type MetricTreeConnectedNodeData = Node<{
    label: string;
    tableName: string;
    metricName: string;
    isEdgeTarget?: boolean;
    isEdgeSource?: boolean;
    timeFrame: TimeFrames;
}>;

const MetricTreeConnectedNode: React.FC<
    NodeProps<MetricTreeConnectedNodeData>
> = ({ data, isConnectable }) => {
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
            p="xs"
            fz="xs"
            sx={(theme) => ({
                backgroundColor: theme.colors.gray[0],
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack key={data.label} spacing="sm">
                <Stack spacing="2xs" align="flex-start">
                    <Title order={6}>{title}</Title>
                    {data.tableName && (
                        <Text fz="xs" c="gray.7">
                            {data.tableName}
                        </Text>
                    )}
                </Stack>

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
                                        change > 0 ? IconArrowUp : IconArrowDown
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
            </Stack>
            <Handle
                type="source"
                position={Position.Bottom}
                hidden={!isConnectable && !data.isEdgeSource}
            />
        </Paper>
    );
};

export default MetricTreeConnectedNode;
