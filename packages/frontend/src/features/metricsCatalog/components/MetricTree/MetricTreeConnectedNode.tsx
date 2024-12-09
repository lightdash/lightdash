import {
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    friendlyName,
    getDefaultDateRangeFromInterval,
    getItemId,
    MetricExplorerComparison,
    TimeFrames,
    type ResultRow,
} from '@lightdash/common';
import { Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowUp } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { calculateComparisonValue } from '../../../../hooks/useBigNumberConfig';
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
    return row?.[itemId]?.value;
}

const MetricTreeConnectedNode: React.FC<
    NodeProps<MetricTreeConnectedNodeData>
> = ({ data, isConnectable }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const dateRange = useMemo(
        () => getDefaultDateRangeFromInterval(TimeFrames.MONTH),
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
    }, [totalQuery.data, data.metricName, data.tableName]);

    const change = useMemo(() => {
        console.log(value, compareValue);

        if (value && compareValue) {
            return calculateComparisonValue(
                Number(value.raw),
                Number(compareValue.raw),
                ComparisonFormatTypes.PERCENTAGE,
            );
        }

        return 0;
    }, [value, compareValue]);

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
        () => value && compareValue && 'Compared to previous month',
        [value, compareValue],
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
                        {value?.formatted ?? '-'}
                    </Text>
                    {value && compareValue && (
                        <Group spacing={1} c={change > 0 ? 'teal' : 'red'}>
                            <Text fz="sm" fw={500}>
                                <span>{formattedChange}</span>
                            </Text>
                            <MantineIcon
                                icon={IconArrowUp}
                                size={16}
                                stroke={1.5}
                            />
                        </Group>
                    )}
                </Group>

                {compareString && (
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
