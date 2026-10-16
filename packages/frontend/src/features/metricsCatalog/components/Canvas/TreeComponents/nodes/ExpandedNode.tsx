import {
    calculateComparisonValue,
    applyCustomFormat,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    getDefaultMetricTreeNodeDateRange,
    getRollingPeriodDates,
    MetricTotalComparisonType,
    TimeFrames,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconHierarchy3, IconInfoCircle } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { type TFunction } from 'i18next';
import React, { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../../../sqlRunner/store/hooks';
import { useRunMetricTotal } from '../../../../hooks/useRunMetricExplorerQuery';
import { MetricDetailPopover } from '../../../MetricDetailPopover';
import { useCanvasYamlDrivers } from '../../CanvasYamlDriversContext';
import classes from './ChangeIndicator.module.css';

const getComparisonLabel = (
    t: TFunction,
    timeFrame: TimeFrames,
    rollingDays?: number,
): string => {
    if (rollingDays) {
        return t('expandedNode.comparison.rolling', { days: rollingDays });
    }
    switch (timeFrame) {
        case TimeFrames.DAY:
            return t('expandedNode.comparison.day');
        case TimeFrames.WEEK:
            return t('expandedNode.comparison.week');
        case TimeFrames.MONTH:
            return t('expandedNode.comparison.month');
        case TimeFrames.YEAR:
            return t('expandedNode.comparison.year');
        default:
            return t('expandedNode.comparison.default');
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
    const { t } = useTranslation('metricsCatalog');
    const variant = useMemo(() => getVariant(change), [change]);

    return (
        <Tooltip
            position="bottom"
            label={getComparisonLabel(t, timeFrame, rollingDays)}
        >
            <Badge
                fz="sm"
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
    id,
    data,
    isConnectable,
    selected,
}) => {
    const { t } = useTranslation('metricsCatalog');
    const title = data.label;

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const yamlDrivers = useCanvasYamlDrivers();
    const missingDrivers = useMemo(() => {
        if (!yamlDrivers) return [];
        const drivers = yamlDrivers.yamlDriversByTarget.get(id);
        if (!drivers?.length) return [];
        return drivers.filter(
            (d) => !yamlDrivers.onCanvasMetricUuids.has(d.catalogSearchUuid),
        );
    }, [yamlDrivers, id]);

    const handleAddDrivers = useCallback(() => {
        if (!yamlDrivers || missingDrivers.length === 0) return;
        yamlDrivers.addMetricsToCanvas(missingDrivers, id);
    }, [yamlDrivers, missingDrivers, id]);

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
            fz="sm"
            style={(theme) => ({
                borderColor: selected
                    ? theme.colors.blue[5]
                    : theme.colors.ldGray[3],
                // Re-enable pointer events so tooltips work even when ReactFlow
                // sets pointer-events:none on node wrappers (viewOnly mode)
                pointerEvents: 'all',
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable && !data.isEdgeTarget}
            />
            <Stack key={data.label} gap="xs">
                <Group justify="space-between">
                    <Title fz="sm" fw={500} c="ldGray.7">
                        {title}
                    </Title>
                    <Group gap="xs" wrap="nowrap">
                        {missingDrivers.length > 0 && (
                            <Tooltip
                                label={t('expandedNode.addYamlDrivers')}
                                openDelay={300}
                            >
                                <ActionIcon
                                    size="xs"
                                    onClick={handleAddDrivers}
                                    aria-label={t(
                                        'expandedNode.addYamlDriversAriaLabel',
                                    )}
                                    data-tour-anchor="tree-add-drivers"
                                    data-tour-hint="Add drivers from YAML"
                                    data-tour-docs="explore/metrics-catalog/drivers.mdx#how-drivers-appear-on-the-canvas:p2:1"
                                >
                                    <MantineIcon
                                        icon={IconHierarchy3}
                                        size={12}
                                        color="dimmed"
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {projectUuid && (
                            <MetricDetailPopover
                                projectUuid={projectUuid}
                                tableName={data.tableName}
                                metricName={data.metricName}
                                metricLabel={data.label}
                                compiledQueryConfig={compiledQueryConfig}
                                showExploreButton
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    size={12}
                                    color="ldGray.5"
                                />
                            </MetricDetailPopover>
                        )}
                    </Group>
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

export default React.memo(ExpandedNode);
