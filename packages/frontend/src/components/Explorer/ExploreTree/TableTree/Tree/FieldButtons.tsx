import {
    Dimension,
    DimensionType,
    friendlyName,
    isDimension,
    isFilterableField,
    Metric,
    MetricType,
    Source,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconDots,
    IconFilter,
    IconSparkles,
    IconTerminal,
} from '@tabler/icons-react';
import { FC, ReactNode, useCallback, useMemo, useState } from 'react';

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

const FieldButtons: FC<{
    node: Metric | Dimension;
    onOpenSourceDialog: (source: Source) => void;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, onOpenSourceDialog, isHovered, isSelected }) => {
    const { isFilteredField, addFilter } = useFilters();
    const isFiltered = isFilteredField(node);
    const { track } = useTracking();
    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
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

    const menuItems = useMemo<ReactNode[]>(() => {
        const items: ReactNode[] = [];

        if (node.source) {
            items.push(
                <Menu.Item
                    key="source"
                    icon={<MantineIcon icon={IconTerminal} />}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (node.source) onOpenSourceDialog(node.source);
                    }}
                >
                    Source
                </Menu.Item>,
            );
        }

        if (isFilterableField(node)) {
            items.push(
                <Menu.Item
                    key="filter"
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
                </Menu.Item>,
            );
        }

        if (isDimension(node)) {
            const customMetrics = getCustomMetricType(node.type);

            if (customMetrics.length > 0) {
                items.push(
                    <Menu.Divider key="custom-metrics-divider" />,
                    <Menu.Label key="custom-metrics-label">
                        <Group spacing="xs">
                            <MantineIcon icon={IconSparkles} /> Add custom
                            metrics
                        </Group>
                    </Menu.Label>,

                    ...customMetrics.map((metric) => (
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
                    )),
                );
            }
        }
        return items;
    }, [addFilter, createCustomMetric, node, onOpenSourceDialog, track]);

    return (
        <Group spacing="xs">
            {isFiltered && <MantineIcon icon={IconFilter} />}

            {node.hidden && (
                <Tooltip
                    withArrow
                    label="This field has been hidden in the dbt project. It's recommend to remove it from the query"
                >
                    <MantineIcon icon={IconAlertTriangle} color="yellow.9" />
                </Tooltip>
            )}

            {menuItems.length > 0 && (isHovered || isSelected) && (
                <Menu withArrow shadow="lg" position="bottom-end">
                    <Menu.Dropdown>{menuItems}</Menu.Dropdown>

                    <Menu.Target>
                        <Tooltip withArrow openDelay={500} label="View options">
                            <ActionIcon size="sm" h="md" variant="transparent">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Tooltip>
                    </Menu.Target>
                </Menu>
            )}
        </Group>
    );
};

export default FieldButtons;
