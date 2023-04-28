import {
    AdditionalMetric,
    Dimension,
    DimensionType,
    fieldId,
    friendlyName,
    isAdditionalMetric,
    isDimension,
    isField,
    isFilterableField,
    Metric,
    MetricType,
} from '@lightdash/common';
import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconDots,
    IconFilter,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';

import { useFilters } from '../../../../../hooks/useFilters';
import { useExplorerContext } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';
import MantineIcon from '../../../../common/MantineIcon';

const getCustomMetricType = (type: DimensionType): MetricType[] => {
    switch (type) {
        case DimensionType.STRING:
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
            return [
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
                MetricType.MIN,
                MetricType.MAX,
            ];

        case DimensionType.NUMBER:
            return [
                MetricType.MIN,
                MetricType.MAX,
                MetricType.SUM,
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.COUNT_DISTINCT,
                MetricType.COUNT,
            ];
        case DimensionType.BOOLEAN:
            return [MetricType.COUNT_DISTINCT, MetricType.COUNT];
        default:
            return [];
    }
};

type Props = {
    node: Metric | Dimension | AdditionalMetric;
    isHovered: boolean;
    isSelected: boolean;
};

const TreeSingleNodeActions: FC<Props> = ({ node, isHovered, isSelected }) => {
    const { isFilteredField, addFilter } = useFilters();
    const isFiltered = isField(node) && isFilteredField(node);
    const { track } = useTracking();

    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
    );

    const removeAdditionalMetric = useExplorerContext(
        (context) => context.actions.removeAdditionalMetric,
    );

    const createCustomMetric = useCallback(
        (dimension: Dimension, type: MetricType) => {
            const shouldCopyFormatting = [
                MetricType.PERCENTILE,
                MetricType.MEDIAN,
                MetricType.AVERAGE,
                MetricType.SUM,
                MetricType.MIN,
                MetricType.MAX,
            ].includes(type);
            const compact =
                shouldCopyFormatting && dimension.compact
                    ? { compact: dimension.compact }
                    : {};
            const format =
                shouldCopyFormatting && dimension.format
                    ? { format: dimension.format }
                    : {};

            const defaultRound =
                type === MetricType.AVERAGE ? { round: 2 } : {};
            const round =
                shouldCopyFormatting && dimension.round
                    ? { round: dimension.round }
                    : defaultRound;

            addAdditionalMetric({
                name: `${dimension.name}_${type}`,
                label: `${friendlyName(type)} of ${dimension.label}`,
                table: dimension.table,
                sql: dimension.sql,
                description: `${friendlyName(type)} of ${
                    dimension.label
                } on the table ${dimension.tableLabel}`,
                type,
                ...format,
                ...round,
                ...compact,
            });
        },
        [addAdditionalMetric],
    );

    const customMetrics = useMemo(
        () => (isDimension(node) ? getCustomMetricType(node.type) : []),
        [node],
    );

    return (
        <Group spacing="xs">
            {isFiltered && (
                <Tooltip withArrow label="This field is filtered">
                    <MantineIcon icon={IconFilter} color="gray.7" />
                </Tooltip>
            )}

            {node.hidden && (
                <Tooltip
                    withArrow
                    label="This field has been hidden in the dbt project. It's recommend to remove it from the query"
                >
                    <MantineIcon icon={IconAlertTriangle} color="yellow.9" />
                </Tooltip>
            )}

            {isHovered || isSelected ? (
                <Menu
                    withArrow
                    withinPortal
                    shadow="lg"
                    position="bottom-end"
                    arrowOffset={12}
                    offset={-4}
                >
                    <Menu.Dropdown>
                        {isField(node) && isFilterableField(node) ? (
                            <Menu.Item
                                icon={<MantineIcon icon={IconFilter} />}
                                onClick={(e) => {
                                    track({
                                        name: EventName.ADD_FILTER_CLICKED,
                                    });
                                    e.stopPropagation();
                                    addFilter(node, undefined);
                                }}
                            >
                                Add filter
                            </Menu.Item>
                        ) : null}

                        {isAdditionalMetric(node) ? (
                            <Menu.Item
                                color="red"
                                key="custommetric"
                                icon={<MantineIcon icon={IconTrash} />}
                                onClick={() => {
                                    // e.stopPropagation();
                                    track({
                                        name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                                    });
                                    removeAdditionalMetric(fieldId(node));
                                }}
                            >
                                Remove custom metric
                            </Menu.Item>
                        ) : null}

                        {customMetrics.length > 0 && isDimension(node) ? (
                            <>
                                <Menu.Divider key="custom-metrics-divider" />
                                <Menu.Label key="custom-metrics-label">
                                    <Group spacing="xs">
                                        <MantineIcon icon={IconSparkles} /> Add
                                        custom metrics
                                    </Group>
                                </Menu.Label>

                                {customMetrics.map((metric) => (
                                    <Menu.Item
                                        key={metric}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            track({
                                                name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                            });
                                            createCustomMetric(node, metric);
                                        }}
                                    >
                                        {friendlyName(metric)}
                                    </Menu.Item>
                                ))}
                            </>
                        ) : null}
                    </Menu.Dropdown>

                    <Menu.Target>
                        <Tooltip
                            withArrow
                            openDelay={500}
                            position="right"
                            label="View options"
                        >
                            <ActionIcon radius="none" variant="transparent">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Tooltip>
                    </Menu.Target>
                </Menu>
            ) : null}
        </Group>
    );
};

export default TreeSingleNodeActions;
