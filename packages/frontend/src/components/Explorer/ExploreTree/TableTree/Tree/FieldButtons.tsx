import { Button, Icon, Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    Dimension,
    DimensionType,
    friendlyName,
    isFilterableField,
    Metric,
    MetricType,
    Source,
} from '@lightdash/common';
import React, { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import { useFilters } from '../../../../../hooks/useFilters';
import { useExplorerContext } from '../../../../../providers/ExplorerProvider';
import { useTracking } from '../../../../../providers/TrackingProvider';
import { EventName } from '../../../../../types/Events';
import { ItemOptions, Placeholder, WarningIcon } from '../TableTree.styles';

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
                <MenuItem2
                    key="source"
                    icon={<Icon icon="console" />}
                    text="Source"
                    onClick={(e) => {
                        if (node.source === undefined) {
                            return;
                        }
                        e.stopPropagation();
                        onOpenSourceDialog(node.source);
                    }}
                />,
            );
        }
        if (isFilterableField(node)) {
            items.push(
                <MenuItem2
                    key="filter"
                    icon="filter"
                    text="Add filter"
                    onClick={(e) => {
                        track({
                            name: EventName.ADD_FILTER_CLICKED,
                        });
                        e.stopPropagation();
                        addFilter(node, undefined);
                    }}
                />,
            );
        }

        if (
            node.fieldType === 'dimension' &&
            getCustomMetricType(node.type).length > 0
        ) {
            items.push(
                <MenuItem2
                    key="custommetric"
                    icon="clean"
                    text="Add custom metric"
                >
                    {getCustomMetricType(node.type)?.map((metric) => (
                        <MenuItem2
                            key={metric}
                            text={friendlyName(metric)}
                            onClick={(e) => {
                                e.stopPropagation();
                                track({
                                    name: EventName.ADD_CUSTOM_METRIC_CLICKED,
                                });
                                createCustomMetric(node, metric);
                            }}
                        />
                    ))}
                </MenuItem2>,
            );
        }
        return items;
    }, [addFilter, createCustomMetric, node, onOpenSourceDialog, track]);

    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

    return (
        <ItemOptions>
            {isFiltered && <Icon icon="filter" />}
            {node.hidden && (
                <Tooltip2 content="This field has been hidden in the dbt project. It's recommend to remove it from the query">
                    <WarningIcon icon={'warning-sign'} intent="warning" />
                </Tooltip2>
            )}
            {menuItems.length > 0 && (isHovered || isSelected || isMenuOpen) && (
                <Popover2
                    content={<Menu>{menuItems}</Menu>}
                    autoFocus={false}
                    position={PopoverPosition.BOTTOM_LEFT}
                    minimal
                    lazy
                    interactionKind="click"
                    renderTarget={({ isOpen, ref, ...targetProps }) => (
                        <Tooltip2
                            content="View options"
                            hoverCloseDelay={500}
                            onClosed={(e) => setIsMenuOpen(false)}
                        >
                            <Button
                                {...targetProps}
                                elementRef={ref === null ? undefined : ref}
                                icon="more"
                                minimal
                                onClick={(e) => {
                                    (targetProps as any).onClick(e);
                                    e.stopPropagation();
                                    setIsMenuOpen(true);
                                }}
                            />
                        </Tooltip2>
                    )}
                />
            )}

            {isFiltered && !isHovered && !isSelected && !isMenuOpen && (
                <Placeholder />
            )}
        </ItemOptions>
    );
};

export default FieldButtons;
