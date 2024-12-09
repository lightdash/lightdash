import {
    friendlyName,
    getDefaultDateRangeFromInterval,
    getItemId,
    // getItemId,
    MetricExplorerComparison,
    TimeFrames,
    type ResultRow,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { IconArrowUp, IconNumber } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useRunMetricExplorerQuery } from '../../hooks/useRunMetricExplorerQuery';

export type MetricTreeConnectedNodeData = Node<{
    label: string;
    tableName: string;
    metricName: string;
    isEdgeTarget?: boolean;
    isEdgeSource?: boolean;
}>;

function getValueFromRow(row: ResultRow | undefined, itemId: string) {
    return row?.[itemId]?.value.formatted;
}

const MetricTreeConnectedNode: React.FC<
    NodeProps<MetricTreeConnectedNodeData>
> = ({ data, isConnectable }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);
    const compareString = useMemo(() => 'Compared to previous month', []); // TODO: will it always be prev month?

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const dateRange = useMemo(
        () => getDefaultDateRangeFromInterval(TimeFrames.YEAR),
        [],
    );

    const totalQuery = useRunMetricExplorerQuery({
        projectUuid,
        exploreName: data.tableName,
        metricName: data.metricName,
        comparison: {
            type: MetricExplorerComparison.PREVIOUS_PERIOD,
        },
        dateRange,
        options: {
            enabled: !!projectUuid,
        },
    });

    const value = useMemo(() => {
        if (totalQuery.data) {
            const itemId = getItemId({
                table: data.tableName,
                name: data.metricName,
            });

            return getValueFromRow(totalQuery.data.rows[0], itemId);
        }
    }, [totalQuery.data, data.metricName, data.tableName]);

    const compareValue = useMemo(() => {
        if (totalQuery.data) {
            const itemId = getItemId({
                table: data.tableName,
                name: data.metricName,
            });

            return getValueFromRow(totalQuery.data.comparisonRows?.[0], itemId);
        }
        return '-';
    }, [totalQuery.data, data.metricName, data.tableName]);

    const change = useMemo(() => {
        if (value && compareValue) {
            return (
                ((Number(value) - Number(compareValue)) /
                    Number(compareValue)) *
                100
            );
        }
        return 0;
    }, [value, compareValue]);

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
                <Group>
                    <Text size="sm" c="dimmed">
                        {title}
                    </Text>
                    <MantineIcon icon={IconNumber} size={22} stroke={1.5} />
                </Group>

                <Group align="flex-end" mt="sm">
                    <Text fz="md" fw={700}>
                        {value ?? '-'}
                    </Text>
                    {value && compareValue && (
                        <Group spacing={1} c={change > 0 ? 'teal' : 'red'}>
                            <Text fz="sm" fw={500}>
                                <span>{change}%</span>
                            </Text>
                            <MantineIcon
                                icon={IconArrowUp}
                                size={16}
                                stroke={1.5}
                            />
                        </Group>
                    )}
                </Group>

                <Text fz="xs" c="dimmed">
                    {compareString}
                </Text>
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
