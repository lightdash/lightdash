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

const ChangeIndicator: FC<{ change: number; formattedChange: string }> = ({
    change,
    formattedChange,
}) => {
    const { classes } = useChangeIndicatorStyles();
    const indicatorClasses = useMemo(() => {
        if (change === 0) {
            return classes.neutral;
        }
        return change > 0 ? classes.positive : classes.negative;
    }, [change, classes]);

    return (
        <Tooltip position="bottom" label={'Current vs. Last Month-to-date'}>
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
        granularity: TimeFrames.DAY, // TODO: this should be dynamic
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
                    backgroundColor: theme.colors.background[0],
                    borderRadius: theme.radius.md,
                    border: `1px solid ${
                        selected ? theme.colors.blue[5] : theme.colors.ldGray[3]
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
                    <Title fz={14} fw={500} c="ldGray.7">
                        {title}
                    </Title>
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
                            color="ldGray.7"
                        />
                    </Tooltip>
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
