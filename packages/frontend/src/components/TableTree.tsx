import {
    AnchorButton,
    Button,
    Classes,
    Colors,
    Dialog,
    Icon,
    Intent,
    Menu,
    MenuItem,
    PopoverPosition,
    Tree,
} from '@blueprintjs/core';
import { TreeEventHandler } from '@blueprintjs/core/src/components/tree/tree';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    CompiledTable,
    Dimension,
    FieldId,
    fieldId,
    Metric,
    Source,
} from 'common';
import Fuse from 'fuse.js';
import React, { FC, useCallback, useMemo, useState } from 'react';

type NodeDataProps = {
    fieldId: FieldId;
    isDimension: boolean;
    source: Source;
};

type TableTreeProps = {
    search: string;
    table: CompiledTable;
    joinSql?: string;
    onSelectedNodeChange: (fieldId: string, isDimension: boolean) => void;
    selectedNodes: Set<string>;
    onOpenSourceDialog: (source: Source) => void;
};

const TableButtons: FC<{
    joinSql?: string;
    table: CompiledTable;
    onOpenSourceDialog: (source: Source) => void;
}> = ({ joinSql, table: { source }, onOpenSourceDialog }) => {
    const [isOpen, setIsOpen] = useState<boolean>();
    const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            {(source || joinSql) && (
                <Popover2
                    isOpen={isOpen === undefined ? false : isOpen}
                    onInteraction={setIsOpen}
                    content={
                        <Menu>
                            {source && (
                                <MenuItem
                                    icon={<Icon icon="console" />}
                                    text="Source"
                                    onClick={(e) => {
                                        if (source === undefined) {
                                            return;
                                        }
                                        e.stopPropagation();
                                        onOpenSourceDialog(source);
                                        setIsOpen(false);
                                    }}
                                />
                            )}
                            {joinSql && (
                                <MenuItem
                                    icon={<Icon icon="intersection" />}
                                    text="Join details"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsJoinDialogOpen(true);
                                        setIsOpen(false);
                                    }}
                                />
                            )}
                        </Menu>
                    }
                    position={PopoverPosition.BOTTOM_LEFT}
                    lazy
                >
                    <Tooltip2 content="View options">
                        <Button
                            minimal
                            icon="more"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(true);
                            }}
                        />
                    </Tooltip2>
                </Popover2>
            )}
            <Dialog
                isOpen={isJoinDialogOpen}
                icon="intersection"
                onClose={() => setIsJoinDialogOpen(false)}
                title="Join details"
                lazy
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        LEFT JOIN <b>{joinSql}</b>
                    </p>
                </div>
            </Dialog>
        </div>
    );
};

const NodeItemButtons: FC<{
    node: Metric | Dimension;
    onOpenSourceDialog: (source: Source) => void;
}> = ({ node: { source }, onOpenSourceDialog }) => {
    const [isOpen, setIsOpen] = useState<boolean>();
    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            <Popover2
                isOpen={isOpen === undefined ? false : isOpen}
                onInteraction={setIsOpen}
                content={
                    <Menu>
                        <MenuItem
                            icon={<Icon icon="console" />}
                            text="Source"
                            onClick={(e) => {
                                if (source === undefined) {
                                    return;
                                }
                                e.stopPropagation();
                                onOpenSourceDialog(source);
                                setIsOpen(false);
                            }}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_LEFT}
                lazy
            >
                <Tooltip2 content="View options">
                    <Button
                        minimal
                        icon="more"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(true);
                        }}
                    />
                </Tooltip2>
            </Popover2>
        </div>
    );
};

type DimensionWithSubDimensions = Dimension & { subDimensions?: Dimension[] };

const renderDimensionTreeNode = (
    dimension: DimensionWithSubDimensions,
    expandedNodes: Array<string | number>,
    selectedNodes: Set<string>,
    onOpenSourceDialog: (source: Source) => void,
): TreeNodeInfo<NodeDataProps> => {
    const baseNode = {
        id: dimension.name,
        label: (
            <Tooltip2 content={dimension.description}>
                {dimension.label}
            </Tooltip2>
        ),
        secondaryLabel: dimension.source && (
            <NodeItemButtons
                node={dimension}
                onOpenSourceDialog={onOpenSourceDialog}
            />
        ),
    };
    if (dimension.subDimensions) {
        const isSubDimensionSelected = dimension.subDimensions.some(
            (subDimension) => selectedNodes.has(fieldId(subDimension)),
        );
        return {
            ...baseNode,
            isExpanded:
                expandedNodes.includes(dimension.name) ||
                isSubDimensionSelected,
            hasCaret: !isSubDimensionSelected,
            childNodes: dimension.subDimensions.map((subDimension) =>
                renderDimensionTreeNode(
                    subDimension,
                    expandedNodes,
                    selectedNodes,
                    onOpenSourceDialog,
                ),
            ),
        };
    }
    return {
        ...baseNode,
        nodeData: {
            fieldId: fieldId(dimension),
            isDimension: true,
        } as NodeDataProps,
        isSelected: selectedNodes.has(fieldId(dimension)),
    };
};

const TableTree: FC<TableTreeProps> = ({
    search,
    table,
    joinSql,
    selectedNodes,
    onSelectedNodeChange,
    onOpenSourceDialog,
}) => {
    const [expandedNodes, setExpandedNodes] = useState<Array<string | number>>([
        table.name,
    ]);
    const { metrics, dimensions: allDimensions } = table;
    const dimensions: DimensionWithSubDimensions[] = useMemo(() => {
        const dimensionsWithSubDimensions = Object.values(allDimensions).reduce<
            Record<string, DimensionWithSubDimensions>
        >((acc, dimension) => {
            if (dimension.group) {
                return {
                    ...acc,
                    [dimension.group]: {
                        ...acc[dimension.group],
                        subDimensions: [
                            ...(acc[dimension.group].subDimensions || []),
                            dimension,
                        ],
                    },
                };
            }
            return { ...acc, [dimension.name]: dimension };
        }, {});

        return Object.values(dimensionsWithSubDimensions);
    }, [allDimensions]);

    const filteredMetrics: Metric[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(Object.values(metrics), {
                keys: ['name', 'description'],
            })
                .search(search)
                .map((res) => res.item);
        }
        return Object.values(metrics);
    }, [metrics, search]);

    const hasNoMetrics = Object.values(metrics).length <= 0;

    const tableContainsAutoMetrics = Object.values(metrics).some(
        (metric) => metric.isAutoGenerated,
    );

    const filteredDimensions: Dimension[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(Object.values(dimensions), {
                keys: ['name', 'description'],
            })
                .search(search)
                .map((res) => res.item);
        }
        return Object.values(dimensions);
    }, [dimensions, search]);

    const metricNode = {
        id: 'metrics',
        label: (
            <span style={{ color: Colors.ORANGE1 }}>
                <strong>
                    {tableContainsAutoMetrics ? 'Example Metrics' : 'Metrics'}
                </strong>
            </span>
        ),
        secondaryLabel:
            hasNoMetrics || tableContainsAutoMetrics ? (
                <AnchorButton
                    minimal
                    href="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics"
                    target="_blank"
                    rightIcon="plus"
                    referrerPolicy="no-referrer"
                >
                    Add metrics
                </AnchorButton>
            ) : null,
        icon: (
            <Icon
                icon={tableContainsAutoMetrics ? 'clean' : 'numerical'}
                intent={Intent.WARNING}
                className={Classes.TREE_NODE_ICON}
            />
        ),
        isExpanded: true,
        hasCaret: false,
        childNodes: hasNoMetrics
            ? [
                  {
                      key: 'no_metrics',
                      id: 'no_metrics',
                      label: 'No metrics defined',
                      disabled: true,
                  },
              ]
            : filteredMetrics
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((metric) => ({
                      key: metric.name,
                      id: metric.name,
                      label: (
                          <Tooltip2 content={metric.description}>
                              {metric.label}
                          </Tooltip2>
                      ),
                      nodeData: {
                          fieldId: fieldId(metric),
                          isDimension: false,
                      } as NodeDataProps,
                      isSelected: selectedNodes.has(fieldId(metric)),
                      secondaryLabel: metric.source && (
                          <NodeItemButtons
                              node={metric}
                              onOpenSourceDialog={onOpenSourceDialog}
                          />
                      ),
                  })),
    };

    const dimensionNode = {
        id: 'dimensions',
        label: (
            <span style={{ color: Colors.BLUE1 }}>
                <strong>Dimensions</strong>
            </span>
        ),
        icon: (
            <Icon
                icon="tag"
                intent={Intent.PRIMARY}
                className={Classes.TREE_NODE_ICON}
            />
        ),
        hasCaret: false,
        isExpanded: true,
        childNodes: filteredDimensions
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((dimension) =>
                renderDimensionTreeNode(
                    dimension,
                    expandedNodes,
                    selectedNodes,
                    onOpenSourceDialog,
                ),
            ),
    };

    const contents: TreeNodeInfo<NodeDataProps>[] = [
        {
            id: table.name,
            label: table.label,
            isExpanded: expandedNodes.includes(table.name),
            secondaryLabel: (
                <TableButtons
                    joinSql={joinSql}
                    table={table}
                    onOpenSourceDialog={onOpenSourceDialog}
                />
            ),
            childNodes: [metricNode, dimensionNode],
        },
    ];

    const handleNodeClick: TreeEventHandler<NodeDataProps> = useCallback(
        (nodeData: TreeNodeInfo<NodeDataProps>, _nodePath: number[]) => {
            if (_nodePath.length !== 1 && nodeData.nodeData) {
                onSelectedNodeChange(
                    nodeData.nodeData.fieldId,
                    nodeData.nodeData.isDimension,
                );
            }
        },
        [onSelectedNodeChange],
    );

    return (
        <Tree
            contents={contents}
            onNodeCollapse={(node) => {
                setExpandedNodes((prevState) =>
                    prevState.filter((id) => id !== node.id),
                );
            }}
            onNodeExpand={(node) => {
                setExpandedNodes((prevState) => [...prevState, node.id]);
            }}
            onNodeClick={handleNodeClick}
        />
    );
};

export default TableTree;
