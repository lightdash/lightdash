import { Classes, Collapse, Colors, Icon, Text } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    AdditionalMetric,
    CompiledTable,
    Dimension,
    friendlyName,
    getItemId,
    hasIntersection,
    hexToRGB,
    isAdditionalMetric,
    isDimension,
    Metric,
    TimeInterval,
} from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useToggle } from 'react-use';
import styled from 'styled-components';
import { getItemBgColor } from '../../../../hooks/useColumns';
import { TrackSection } from '../../../../providers/TrackingProvider';
import { SectionName } from '../../../../types/Events';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import {
    CustomMetricButtons,
    getItemIconName,
    NodeItemButtons,
} from './TableTree';
import { TooltipContent } from './TableTree.styles';
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

const timeIntervalSort = [
    undefined,
    'RAW',
    TimeInterval.DAY,
    TimeInterval.WEEK,
    TimeInterval.MONTH,
    TimeInterval.YEAR,
];

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
    padding-left: ${({ depth }) => depth * 24 + 10}px;
    padding-right: 10px;
    height: 30px;
    display: flex;
    align-items: center;
    cursor: ${({ onClick }) => (onClick ? 'pointer' : undefined)};

    :hover {
        background-color: ${({ selected, bgColor }) =>
            selected && bgColor ? hexToRGB(bgColor, 0.8) : Colors.LIGHT_GRAY5};
    }

    background-color: ${({ selected, bgColor }) =>
        selected && bgColor ? hexToRGB(bgColor, 1) : undefined};
`;

const TreeSingleNode: FC<{ node: Node; depth: number }> = ({ node, depth }) => {
    const [isHover, toggle] = useToggle(false);
    const { itemsMap, selectedItems, onItemClick } = useTableTreeContext();

    const item = itemsMap[node.key];
    if (!item) {
        return null;
    }
    const isSelected = selectedItems.has(node.key);
    const label =
        isDimension(item) && item.group
            ? friendlyName(item.name.replace(item?.group, ''))
            : item.label;
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
                <Text ellipsize>{label}</Text>
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
    const [isOpen, toggle] = useToggle(false);
    const { selectedItems } = useTableTreeContext();
    const allChildrenKeys: string[] = getAllChildrenKeys([node]);
    const hasSelectedChildren = hasIntersection(
        allChildrenKeys,
        Array.from(selectedItems),
    );

    useEffect(() => {
        if (hasSelectedChildren) {
            toggle(true);
        }
    }, [hasSelectedChildren, toggle]);

    return (
        <>
            <Row
                depth={depth}
                onClick={hasSelectedChildren ? undefined : toggle}
                style={{
                    fontWeight: 600,
                }}
            >
                <Icon
                    icon={isOpen ? 'chevron-down' : 'chevron-right'}
                    size={16}
                    style={{ marginRight: 8 }}
                    color={hasSelectedChildren ? Colors.LIGHT_GRAY1 : undefined}
                />
                <Text ellipsize>{node.label}</Text>
            </Row>
            <Collapse isOpen={isOpen}>
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
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (fieldId: string, isDimension: boolean) => void;
};

const TableTree: FC<Props> = ({
    showTableLabel,
    table,
    additionalMetrics,
    selectedItems,
    onSelectedNodeChange,
}) => {
    const [isOpen, toggle] = useToggle(true);
    const treeRootDepth = showTableLabel ? 2 : 1;
    const hasNoMetrics = Object.keys(table.metrics).length <= 0;

    const itemsTrees = (
        <>
            <Row
                depth={1}
                style={{
                    fontWeight: 600,
                    color: Colors.BLUE1,
                }}
            >
                Dimensions
            </Row>
            {Object.keys(table.dimensions).length <= 0 ? (
                <span>No dimensions defined in your dbt project</span>
            ) : (
                <TableTreeProvider
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
                depth={1}
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
                <span>No metrics defined in your dbt project</span>
            ) : (
                <TableTreeProvider
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
                depth={1}
                style={{
                    fontWeight: 600,
                    color: Colors.ORANGE1,
                    marginTop: 10,
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
                <span>
                    Add custom metrics by hovering over the dimension of your
                    choice & selecting the three-dot Action Menu
                </span>
            ) : (
                <TableTreeProvider
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
                    <Icon
                        icon={isOpen ? 'chevron-down' : 'chevron-right'}
                        size={16}
                        style={{ marginRight: 8 }}
                    />
                    <Text ellipsize>{table.label}</Text>
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
