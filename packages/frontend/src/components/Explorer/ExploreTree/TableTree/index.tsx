import {
    Button,
    Classes,
    Collapse,
    Colors,
    Icon,
    Menu,
    MenuItem,
    PopoverPosition,
    Tag,
    Text,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    AdditionalMetric,
    CompiledTable,
    Dimension,
    DimensionType,
    fieldId,
    friendlyName,
    getItemId,
    hasIntersection,
    hexToRGB,
    isAdditionalMetric,
    isDimension,
    isFilterableField,
    Metric,
    MetricType,
    Source,
    TimeInterval,
} from '@lightdash/common';
import React, { FC, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useToggle } from 'react-use';
import styled from 'styled-components';
import { getItemBgColor } from '../../../../hooks/useColumns';
import { useFilters } from '../../../../hooks/useFilters';
import { useExplorer } from '../../../../providers/ExplorerProvider';
import {
    TrackSection,
    useTracking,
} from '../../../../providers/TrackingProvider';
import { EventName, SectionName } from '../../../../types/Events';
import HighlightedText from '../../../common/HighlightedText';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import {
    ItemOptions,
    Placeholder,
    TooltipContent,
    WarningIcon,
} from './TableTree.styles';
import { TableTreeProvider, useTableTreeContext } from './TableTreeProvider';

export type Node = {
    key: string;
    label: string;
    children?: NodeMap;
};

export type GroupNode = Required<Node>;

export type NodeMap = Record<string, Node>;

export const isGroupNode = (node: Node): node is GroupNode =>
    'children' in node;

export const Hightlighed = styled.b``;

const timeIntervalSort = [
    undefined,
    'RAW',
    TimeInterval.DAY,
    TimeInterval.WEEK,
    TimeInterval.MONTH,
    TimeInterval.YEAR,
];

export const getItemIconName = (type: DimensionType | MetricType) => {
    switch (type) {
        case DimensionType.STRING || MetricType.STRING:
            return 'citation';
        case DimensionType.NUMBER || MetricType.NUMBER:
            return 'numerical';
        case DimensionType.DATE || MetricType.DATE:
            return 'calendar';
        case DimensionType.BOOLEAN || MetricType.BOOLEAN:
            return 'segmented-control';
        case DimensionType.TIMESTAMP:
            return 'time';
        default:
            return 'numerical';
    }
};

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

const NodeItemButtons: FC<{
    node: Metric | Dimension;
    onOpenSourceDialog: (source: Source) => void;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, onOpenSourceDialog, isHovered, isSelected }) => {
    const { isFilteredField, addFilter } = useFilters();
    const isFiltered = isFilteredField(node);
    const { track } = useTracking();

    const {
        actions: { addAdditionalMetric },
    } = useExplorer();

    const createCustomMetric = useCallback(
        (dimension: Dimension, type: MetricType) => {
            const shouldCopyFormatting = [
                MetricType.AVERAGE,
                MetricType.SUM,
                MetricType.MIN,
                MetricType.MAX,
            ].includes(type);
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
            });
        },
        [addAdditionalMetric],
    );

    const menuItems = useMemo<ReactNode[]>(() => {
        const items: ReactNode[] = [];
        if (node.source) {
            items.push(
                <MenuItem
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
                <MenuItem
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
                <MenuItem
                    key="custommetric"
                    icon="clean"
                    text="Add custom metric"
                >
                    {getCustomMetricType(node.type)?.map((metric) => (
                        <MenuItem
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
                </MenuItem>,
            );
        }
        return items;
    }, [addFilter, createCustomMetric, node, onOpenSourceDialog, track]);

    return (
        <ItemOptions>
            {isFiltered && <Icon icon="filter" />}
            {node.hidden && (
                <Tooltip2 content="This field has been hidden in the dbt project. It's recommend to remove it from the query">
                    <WarningIcon icon={'warning-sign'} intent="warning" />
                </Tooltip2>
            )}
            {menuItems.length > 0 && (isHovered || isSelected) && (
                <Popover2
                    content={<Menu>{menuItems}</Menu>}
                    autoFocus={false}
                    position={PopoverPosition.BOTTOM_LEFT}
                    minimal
                    lazy
                    interactionKind="click"
                    renderTarget={({ isOpen, ref, ...targetProps }) => (
                        <Tooltip2 content="View options">
                            <Button
                                {...targetProps}
                                elementRef={ref === null ? undefined : ref}
                                icon="more"
                                minimal
                                onClick={(e) => {
                                    (targetProps as any).onClick(e);
                                    e.stopPropagation();
                                }}
                            />
                        </Tooltip2>
                    )}
                />
            )}

            {isFiltered && !isHovered && !isSelected && <Placeholder />}
        </ItemOptions>
    );
};

const CustomMetricButtons: FC<{
    node: AdditionalMetric;
    isHovered: boolean;
    isSelected: boolean;
}> = ({ node, isHovered, isSelected }) => {
    const { track } = useTracking();

    const {
        actions: { removeAdditionalMetric },
    } = useExplorer();

    const menuItems = useMemo<ReactNode[]>(() => {
        return [
            <MenuItem
                key="custommetric"
                icon="delete"
                text="Remove custom metric"
                onClick={(e) => {
                    e.stopPropagation();
                    track({
                        name: EventName.REMOVE_CUSTOM_METRIC_CLICKED,
                    });
                    removeAdditionalMetric(fieldId(node));
                }}
            />,
        ];
    }, [removeAdditionalMetric, node, track]);

    return (
        <div
            style={{
                display: 'inline-flex',
                gap: '10px',
            }}
        >
            {menuItems.length > 0 && (isHovered || isSelected) && (
                <Popover2
                    content={<Menu>{menuItems}</Menu>}
                    autoFocus={false}
                    position={PopoverPosition.BOTTOM_LEFT}
                    minimal
                    lazy
                    interactionKind="click"
                    renderTarget={({ isOpen, ref, ...targetProps }) => (
                        <Tooltip2 content="View options">
                            <Button
                                {...targetProps}
                                elementRef={ref === null ? undefined : ref}
                                icon="more"
                                minimal
                                onClick={(e) => {
                                    (targetProps as any).onClick(e);
                                    e.stopPropagation();
                                }}
                            />
                        </Tooltip2>
                    )}
                />
            )}
        </div>
    );
};

const sortNodes =
    (itemsMap: Record<string, Dimension | Metric | AdditionalMetric>) =>
    (a: Node, b: Node) => {
        const itemA = itemsMap[a.key];
        const itemB = itemsMap[b.key];

        let order;
        if (a.children && !b.children) {
            order = -1;
        } else if (!a.children && b.children) {
            order = 1;
        } else if (
            isDimension(itemA) &&
            isDimension(itemB) &&
            itemA.timeInterval &&
            itemB.timeInterval
        ) {
            return (
                timeIntervalSort.indexOf(itemA.timeInterval) -
                timeIntervalSort.indexOf(itemB.timeInterval)
            );
        } else {
            order = a.label.localeCompare(b.label);
        }
        return order;
    };

const getAllChildrenKeys = (nodes: Node[]): string[] => {
    return nodes.flatMap(function loop(node): string[] {
        if (node.children) return Object.values(node.children).flatMap(loop);
        else return [node.key];
    });
};

const Row = styled.div<{
    depth: number;
    selected?: boolean;
    bgColor?: string;
    onClick?: () => void;
}>`
    padding-left: ${({ depth }) => depth * 24}px;
    padding-right: 10px;
    height: 30px;
    display: flex;
    align-items: center;
    ${({ onClick, selected, bgColor }) =>
        onClick &&
        `
        cursor: pointer;
        
        :hover {
            background-color: ${
                selected && bgColor
                    ? hexToRGB(bgColor, 0.8)
                    : Colors.LIGHT_GRAY5
            }
        }
        
    `}

    background-color: ${({ selected, bgColor }) =>
        selected && bgColor ? hexToRGB(bgColor, 1) : undefined};
`;

const TreeSingleNode: FC<{ node: Node; depth: number }> = ({ node, depth }) => {
    const [isHover, toggle] = useToggle(false);
    const {
        itemsMap,
        selectedItems,
        isSearching,
        searchResults,
        searchQuery,
        onItemClick,
    } = useTableTreeContext();
    const isSelected = selectedItems.has(node.key);
    const isVisible = !isSearching || searchResults.has(node.key);
    const item = itemsMap[node.key];

    if (!item || !isVisible) {
        return null;
    }

    const label: string =
        isDimension(item) && item.group
            ? friendlyName(item.name.replace(item?.group, ''))
            : item.label || item.name;
    return (
        <Row
            depth={depth}
            selected={isSelected}
            bgColor={getItemBgColor(item)}
            onClick={() => onItemClick(node.key, item)}
            onMouseEnter={() => toggle(true)}
            onMouseLeave={() => toggle(false)}
        >
            <Icon
                icon={getItemIconName(item.type)}
                color={isDimension(item) ? Colors.BLUE1 : Colors.ORANGE1}
                size={16}
                style={{ marginRight: 8 }}
            />
            <Tooltip2
                content={item.description}
                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
            >
                <Text ellipsize>
                    <HighlightedText
                        text={label}
                        query={searchQuery || ''}
                        highlightElement={Hightlighed}
                    />
                </Text>
            </Tooltip2>
            <span style={{ flex: 1 }} />
            {isAdditionalMetric(item) ? (
                <CustomMetricButtons
                    node={item}
                    isHovered={isHover}
                    isSelected={isSelected}
                />
            ) : (
                <NodeItemButtons
                    node={item}
                    onOpenSourceDialog={() => undefined}
                    isHovered={isHover}
                    isSelected={isSelected}
                />
            )}
        </Row>
    );
};

const TreeGroupNode: FC<{ node: GroupNode; depth: number }> = ({
    node,
    depth,
}) => {
    const { selectedItems, isSearching, searchQuery, searchResults } =
        useTableTreeContext();
    const [isOpen, toggle] = useToggle(false);
    const allChildrenKeys: string[] = getAllChildrenKeys([node]);
    const hasSelectedChildren = hasIntersection(
        allChildrenKeys,
        Array.from(selectedItems),
    );
    const hasVisibleChildren =
        !isSearching ||
        hasIntersection(allChildrenKeys, Array.from(searchResults));
    const forceOpen = isSearching && hasVisibleChildren;
    const isDisabled = hasSelectedChildren || forceOpen;

    useEffect(() => {
        if (hasSelectedChildren) {
            toggle(true);
        }
    }, [hasSelectedChildren, toggle]);

    if (!hasVisibleChildren) {
        return null;
    }

    return (
        <>
            <Row
                depth={depth}
                onClick={isDisabled ? undefined : toggle}
                style={{
                    fontWeight: 600,
                }}
            >
                <Icon
                    icon={
                        isOpen || forceOpen ? 'chevron-down' : 'chevron-right'
                    }
                    size={16}
                    style={{ marginRight: 8 }}
                    color={isDisabled ? Colors.LIGHT_GRAY1 : undefined}
                />
                <Text ellipsize>
                    <HighlightedText
                        text={node.label}
                        query={searchQuery || ''}
                        highlightElement={Hightlighed}
                    />
                </Text>
            </Row>
            <Collapse isOpen={isOpen || forceOpen}>
                {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
                <TreeNodeGroup nodeMap={node.children} depth={depth + 1} />
            </Collapse>
        </>
    );
};

const TreeNodeGroup: FC<{ nodeMap: NodeMap; depth: number }> = ({
    nodeMap,
    depth,
}) => {
    const { itemsMap } = useTableTreeContext();
    return (
        <div>
            {Object.values(nodeMap)
                .sort(sortNodes(itemsMap))
                .map((node) =>
                    isGroupNode(node) ? (
                        <TreeGroupNode
                            key={node.key}
                            node={node}
                            depth={depth}
                        />
                    ) : (
                        <TreeSingleNode
                            key={node.key}
                            node={node}
                            depth={depth}
                        />
                    ),
                )}
        </div>
    );
};

const TreeRoot: FC<{ depth?: number }> = ({ depth }) => {
    const { nodeMap } = useTableTreeContext();
    return <TreeNodeGroup nodeMap={nodeMap} depth={depth || 0} />;
};

type Props = {
    searchQuery?: string;
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
};

const TableTree: FC<Props> = ({
    searchQuery,
    showTableLabel,
    table,
    additionalMetrics,
    selectedItems,
    onSelectedNodeChange,
}) => {
    const [isOpen, toggle] = useToggle(true);
    const treeRootDepth = showTableLabel ? 2 : 1;
    const sectionDepth = showTableLabel ? 1 : 0;
    const hasNoMetrics = Object.keys(table.metrics).length <= 0;
    const tableItemsCount =
        Object.values(table.dimensions).filter((item) => !item.hidden).length +
        Object.values(table.metrics).filter((item) => !item.hidden).length +
        additionalMetrics.length;

    const itemsTrees = (
        <>
            <Row
                depth={sectionDepth}
                style={{
                    fontWeight: 600,
                    color: Colors.BLUE1,
                }}
            >
                Dimensions
            </Row>
            {Object.keys(table.dimensions).length <= 0 ? (
                <div
                    style={{
                        color: Colors.GRAY3,
                        margin: '10px 24px',
                    }}
                >
                    No dimensions defined in your dbt project
                </div>
            ) : (
                <TableTreeProvider
                    searchQuery={searchQuery}
                    itemsMap={Object.values(table.dimensions).reduce(
                        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                        {},
                    )}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, true)}
                >
                    <TreeRoot depth={treeRootDepth} />
                </TableTreeProvider>
            )}
            <Row
                depth={sectionDepth}
                style={{
                    fontWeight: 600,
                    color: Colors.ORANGE1,
                    marginTop: 10,
                }}
            >
                Metrics
                <span style={{ flex: 1 }} />
                {hasNoMetrics && (
                    <DocumentationHelpButton
                        url={
                            'https://docs.lightdash.com/get-started/setup-lightdash/add-metrics/#2-add-a-metric-to-your-project'
                        }
                        tooltipProps={{
                            content: (
                                <TooltipContent>
                                    <b>View docs</b> - Add a metric to your
                                    project
                                </TooltipContent>
                            ),
                        }}
                        iconProps={{
                            style: {
                                color: Colors.GRAY3,
                            },
                        }}
                    />
                )}
            </Row>
            {hasNoMetrics ? (
                <div
                    style={{
                        color: Colors.GRAY3,
                        margin: '10px 24px',
                    }}
                >
                    No metrics defined in your dbt project
                </div>
            ) : (
                <TableTreeProvider
                    searchQuery={searchQuery}
                    itemsMap={Object.values(table.metrics).reduce(
                        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                        {},
                    )}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                >
                    <TreeRoot depth={treeRootDepth} />
                </TableTreeProvider>
            )}
            <Row
                depth={sectionDepth}
                style={{
                    fontWeight: 600,
                    color: Colors.ORANGE1,
                    marginTop: 10,
                    marginBottom: 10,
                }}
            >
                Custom metrics
                <span style={{ flex: 1 }} />
                <DocumentationHelpButton
                    url={
                        'https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view'
                    }
                    tooltipProps={{
                        content: (
                            <TooltipContent>
                                Add custom metrics by hovering over the
                                dimension of your choice & selecting the
                                three-dot Action Menu.{' '}
                                <b>Click to view docs.</b>
                            </TooltipContent>
                        ),
                    }}
                    iconProps={{
                        style: {
                            color: Colors.GRAY3,
                        },
                    }}
                />
            </Row>
            {hasNoMetrics && additionalMetrics.length <= 0 ? (
                <div
                    style={{
                        color: Colors.GRAY3,
                        margin: '10px 24px',
                    }}
                >
                    Add custom metrics by hovering over the dimension of your
                    choice & selecting the three-dot Action Menu
                </div>
            ) : (
                <TableTreeProvider
                    searchQuery={searchQuery}
                    itemsMap={additionalMetrics.reduce<
                        Record<string, AdditionalMetric>
                    >(
                        (acc, item) => ({
                            ...acc,
                            [getItemId(item)]: item,
                        }),
                        {},
                    )}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                >
                    <TreeRoot depth={treeRootDepth} />
                </TableTreeProvider>
            )}
        </>
    );

    if (showTableLabel) {
        return (
            <TrackSection name={SectionName.SIDEBAR}>
                <Row
                    depth={0}
                    onClick={toggle}
                    style={{
                        fontWeight: 600,
                    }}
                >
                    <Icon icon={'th'} size={16} style={{ marginRight: 8 }} />
                    <Text ellipsize>{table.label}</Text>
                    {!isOpen && (
                        <Tag minimal round style={{ marginLeft: 10 }}>
                            {tableItemsCount}
                        </Tag>
                    )}
                    <span style={{ flex: 1 }} />
                    <Icon
                        icon={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                    />
                </Row>
                <Collapse isOpen={isOpen}>{itemsTrees}</Collapse>
            </TrackSection>
        );
    } else {
        return (
            <TrackSection name={SectionName.SIDEBAR}>
                {itemsTrees}{' '}
            </TrackSection>
        );
    }
};

export default TableTree;
