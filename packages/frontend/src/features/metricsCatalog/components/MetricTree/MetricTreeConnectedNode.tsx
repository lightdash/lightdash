import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    friendlyName,
    getDefaultDateRangeFromInterval,
    MetricTotalComparisonType,
    type TimeFrames,
} from '@lightdash/common';
import { Group, Stack, Text, Title } from '@mantine/core';
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
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const dateRange = useMemo(
        () => getDefaultDateRangeFromInterval(data.timeFrame),
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

        if (value?.raw && compareValue?.raw) {
            return calculateComparisonValue(
                Number(value.raw),
                Number(compareValue.raw),
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

    return (
        <div
            style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                backgroundColor: '#fff',
            }}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack spacing="xxs" key={data.label}>
                <Stack spacing="2xs" align="flex-start">
                    <Title order={6}>{title}</Title>
                    {data.tableName && (
                        <Text fz="xs" c="dimmed">
                            {data.tableName}
                        </Text>
                    )}
                </Stack>

                <Group align="flex-end" mt="sm">
                    <Text fz="md" fw={700}>
                        {totalQuery.data?.value?.formatted ?? '-'}
                    </Text>
                    {change && (
                        <Group spacing={1} c={change > 0 ? 'teal' : 'red'}>
                            <Text fz="sm" fw={500}>
                                <Text span>{formattedChange}</Text>
                            </Text>
                            <MantineIcon
                                icon={change > 0 ? IconArrowUp : IconArrowDown}
                                size={16}
                                stroke={1.5}
                            />
                        </Group>
                    )}
                </Group>

                {change && (
                    <Text fz="xs" c="dimmed">
                        {compareString}
                    </Text>
                )}
            </Stack>
            <Handle
                type="source"
                position={Position.Bottom}
                hidden={!isConnectable && !data.isEdgeSource}
            />
        </div>
    );
};

export default MetricTreeConnectedNode;
