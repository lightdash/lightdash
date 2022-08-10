import {
    Button,
    Classes,
    Colors,
    Dialog,
    Icon,
    Menu,
    MenuItem,
    PopoverPosition,
    Tree,
} from '@blueprintjs/core';
import { TreeEventHandler } from '@blueprintjs/core/src/components/tree/tree';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    AdditionalMetric,
    CompiledMetric,
    CompiledTable,
    Dimension,
    DimensionType,
    Field,
    fieldId,
    FieldId,
    friendlyName,
    isDimension,
    isFilterableField,
    Metric,
    MetricType,
    Source,
    TimeInterval,
    toggleArrayValue,
} from '@lightdash/common';
import Fuse from 'fuse.js';
import React, { FC, ReactNode, useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useFilters } from '../../../../hooks/useFilters';
import { useExplorer } from '../../../../providers/ExplorerProvider';
import {
    TrackSection,
    useTracking,
} from '../../../../providers/TrackingProvider';
import { EventName, SectionName } from '../../../../types/Events';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import {
    ItemIcon,
    ItemLabel,
    ItemLabelWrapper,
    ItemOptions,
    Placeholder,
    TableTreeGlobalStyle,
    TooltipContent,
    WarningIcon,
} from './TableTree.styles';

const TreeWrapper = styled.div<{ hasMultipleTables: boolean }>`
    margin-left: ${({ hasMultipleTables }) =>
        hasMultipleTables ? '0' : '-20'}px;
`;

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
    hasMultipleTables: boolean;
    isFirstTable: boolean;
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

export const NodeItemButtons: FC<{
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

export const CustomMetricButtons: FC<{
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

type DimensionWithSubDimensions = Dimension & { subDimensions?: Dimension[] };

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

const getGroupedNodes = <T extends Field>(fields: T[]) => {
    return fields.reduce<{
        grouped: Record<string, T[]>;
        ungrouped: T[];
    }>(
        ({ grouped, ungrouped }, dim) => {
            if (dim.groupLabel) {
                return {
                    grouped: {
                        ...grouped,
                        [dim.groupLabel]: [
                            ...(grouped[dim.groupLabel] || []),
                            dim,
                        ].sort((a, b) => a.label.localeCompare(b.label)),
                    },
                    ungrouped,
                };
            }
            return { grouped, ungrouped: [...ungrouped, dim] };
        },
        { grouped: {}, ungrouped: [] },
    );
};

const renderMetricTreeNode = (
    metric: Metric,
    expandedNodes: Array<string | number>,
    selectedNodes: Set<string>,
    onOpenSourceDialog: (source: Source) => void,
    hoveredFieldId: string,
): TreeNodeInfo<NodeDataProps> => {
    return {
        id: metric.name,
        label: (
            <Tooltip2 content={metric.description}>
                <ItemLabelWrapper>
                    <ItemIcon icon={getItemIconName(metric.type)} />
                    <ItemLabel>{metric.label}</ItemLabel>
                </ItemLabelWrapper>
            </Tooltip2>
        ),
        nodeData: {
            fieldId: fieldId(metric),
            isDimension: false,
        } as NodeDataProps,
        isSelected: selectedNodes.has(fieldId(metric)),
        secondaryLabel: (
            <NodeItemButtons
                node={metric}
                onOpenSourceDialog={onOpenSourceDialog}
                isHovered={hoveredFieldId === fieldId(metric)}
                isSelected={selectedNodes.has(fieldId(metric))}
            />
        ),
    };
};

const renderDimensionTreeNode = (
    dimension: DimensionWithSubDimensions,
    expandedNodes: Array<string | number>,
    selectedNodes: Set<string>,
    onOpenSourceDialog: (source: Source) => void,
    hoveredFieldId: string,
): TreeNodeInfo<NodeDataProps> => {
    const itemLabel = dimension?.group
        ? friendlyName(dimension.name.replace(dimension?.group, ''))
        : dimension.label;
    const baseNode = {
        id: dimension.name,
        label: (
            <Tooltip2 content={dimension.description}>
                <ItemLabelWrapper>
                    <ItemIcon
                        icon={getItemIconName(dimension.type)}
                        className={Classes.TREE_NODE_ICON}
                    />
                    <ItemLabel>{itemLabel}</ItemLabel>
                </ItemLabelWrapper>
            </Tooltip2>
        ),
        secondaryLabel: (
            <NodeItemButtons
                node={dimension}
                onOpenSourceDialog={onOpenSourceDialog}
                isHovered={hoveredFieldId === fieldId(dimension)}
                isSelected={selectedNodes.has(fieldId(dimension))}
            />
        ),
    };
    if (dimension.subDimensions) {
        const isSubDimensionSelected = dimension.subDimensions.some(
            (subDimension) => selectedNodes.has(fieldId(subDimension)),
        );
        const timeIntervalSort = [
            undefined,
            'RAW',
            TimeInterval.DAY,
            TimeInterval.WEEK,
            TimeInterval.MONTH,
            TimeInterval.YEAR,
        ];
        const sortedDimensions =
            dimension.type === DimensionType.TIMESTAMP ||
            dimension.type === DimensionType.DATE
                ? dimension.subDimensions.sort((a, b) => {
                      return (
                          timeIntervalSort.indexOf(a.timeInterval) -
                          timeIntervalSort.indexOf(b.timeInterval)
                      );
                  })
                : dimension.subDimensions;

        return {
            ...baseNode,
            isExpanded:
                expandedNodes.includes(dimension.name) ||
                isSubDimensionSelected,
            hasCaret: !isSubDimensionSelected,
            childNodes: sortedDimensions.map((subDimension) =>
                renderDimensionTreeNode(
                    subDimension,
                    expandedNodes,
                    selectedNodes,
                    onOpenSourceDialog,
                    hoveredFieldId,
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

const renderGroupNode = (
    id: string,
    label: string,
    fields: Array<Metric | DimensionWithSubDimensions>,
    expandedNodes: Array<string | number>,
    selectedNodes: Set<string>,
    onOpenSourceDialog: (source: Source) => void,
    hoveredFieldId: string,
): TreeNodeInfo<NodeDataProps> => {
    const isSubDimensionSelected = fields.some(
        (field) =>
            selectedNodes.has(fieldId(field)) ||
            (isDimension(field) &&
                field.subDimensions?.some((subDimension) =>
                    selectedNodes.has(fieldId(subDimension)),
                )),
    );
    return {
        id,
        label,
        isExpanded: isSubDimensionSelected || expandedNodes.includes(id),
        hasCaret: !isSubDimensionSelected,
        childNodes: fields.map((field) =>
            isDimension(field)
                ? renderDimensionTreeNode(
                      field,
                      expandedNodes,
                      selectedNodes,
                      onOpenSourceDialog,
                      hoveredFieldId,
                  )
                : renderMetricTreeNode(
                      field,
                      expandedNodes,
                      selectedNodes,
                      onOpenSourceDialog,
                      hoveredFieldId,
                  ),
        ),
    };
};

const TableTree: FC<TableTreeProps> = ({
    search,
    table,
    joinSql,
    selectedNodes,
    onSelectedNodeChange,
    onOpenSourceDialog,
    hasMultipleTables,
    isFirstTable,
}) => {
    const {
        state: {
            unsavedChartVersion: {
                metricQuery: { additionalMetrics },
            },
        },
    } = useExplorer();
    const [hoveredFieldId, setHoveredFieldId] = useState<string>('');
    const [expandedNodes, setExpandedNodes] = useState<Array<string | number>>([
        table.name,
    ]);
    const { metrics: allMetrics, dimensions: allDimensions } = table;
    const metrics: CompiledMetric[] = useMemo(() => {
        return Object.values(allMetrics).filter(({ hidden }) => !hidden);
    }, [allMetrics]);
    const dimensions: DimensionWithSubDimensions[] = useMemo(() => {
        const dimensionsWithSubDimensions = Object.values(allDimensions).reduce<
            Record<string, DimensionWithSubDimensions>
        >((acc, dimension) => {
            if (dimension.hidden && !selectedNodes.has(fieldId(dimension))) {
                return acc;
            }
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
    }, [allDimensions, selectedNodes]);

    const filteredMetrics: Metric[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(metrics, {
                keys: ['label'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((res) => res.item);
        }
        return metrics;
    }, [metrics, search]);

    const metricChildNodes = useMemo(() => {
        return getGroupedNodes(filteredMetrics);
    }, [filteredMetrics]);

    const hasNoMetrics = metrics.length <= 0;

    const filteredDimensions: Dimension[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(dimensions, {
                keys: ['label'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((res) => res.item);
        }
        return dimensions;
    }, [dimensions, search]);

    const dimensionChildNodes = useMemo(() => {
        return getGroupedNodes(filteredDimensions);
    }, [filteredDimensions]);

    const metricNode = {
        id: 'metrics',
        label: (
            <span style={{ color: Colors.ORANGE1 }}>
                <strong>Metrics</strong>
            </span>
        ),
        secondaryLabel: hasNoMetrics ? (
            <DocumentationHelpButton
                url={
                    'https://docs.lightdash.com/get-started/setup-lightdash/add-metrics/#2-add-a-metric-to-your-project'
                }
                tooltipProps={{
                    content: (
                        <TooltipContent>
                            <b>View docs</b> - Add a metric to your project
                        </TooltipContent>
                    ),
                }}
                iconProps={{
                    style: {
                        color: Colors.GRAY3,
                    },
                }}
            />
        ) : undefined,
        isExpanded: true,
        hasCaret: false,
        childNodes: hasNoMetrics
            ? [
                  {
                      key: 'no_metrics',
                      id: 'no_metrics',
                      label: 'No metrics defined in your dbt project',
                      disabled: true,
                  },
              ]
            : [
                  ...Object.entries(metricChildNodes.grouped)
                      .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
                      .map(([label, groupedFields]) =>
                          renderGroupNode(
                              `metric_group.${label}`,
                              label,
                              groupedFields,
                              expandedNodes,
                              selectedNodes,
                              onOpenSourceDialog,
                              hoveredFieldId,
                          ),
                      ),
                  ...metricChildNodes.ungrouped
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((metric) =>
                          renderMetricTreeNode(
                              metric,
                              expandedNodes,
                              selectedNodes,
                              onOpenSourceDialog,
                              hoveredFieldId,
                          ),
                      ),
              ],
    };

    const tableAdditionalMetrics = additionalMetrics?.filter(
        (metric) => metric.table === table.name,
    );

    const emptyCustomMetricsChildrenNodes = hasNoMetrics
        ? [
              {
                  key: 'no_custom_metrics',
                  id: 'no_custom_metrics',
                  label: 'Add custom metrics by hovering over the dimension of your choice & selecting the three-dot Action Menu',
                  disabled: true,
                  className: 'no-custom-metrics',
              },
          ]
        : [];

    const customMetricsNode = {
        id: 'customMetrics',
        label: (
            <span style={{ color: Colors.ORANGE1 }}>
                <strong>Custom metrics</strong>
            </span>
        ),
        hasCaret: false,
        isExpanded: true,
        secondaryLabel: isFirstTable ? (
            <DocumentationHelpButton
                url={
                    'https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view'
                }
                tooltipProps={{
                    content: (
                        <TooltipContent>
                            Add custom metrics by hovering over the dimension of
                            your choice & selecting the three-dot Action Menu.{' '}
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
        ) : undefined,
        childNodes:
            !tableAdditionalMetrics || tableAdditionalMetrics.length <= 0
                ? emptyCustomMetricsChildrenNodes
                : tableAdditionalMetrics
                      .sort((a, b) =>
                          (a.label || a.name).localeCompare(b.label || b.name),
                      )
                      .map((metric) => ({
                          key: metric.name,
                          id: metric.name,
                          label: (
                              <Tooltip2
                                  key={metric.label}
                                  content={metric.description}
                              >
                                  <ItemLabelWrapper>
                                      <ItemIcon
                                          icon={getItemIconName(metric.type)}
                                      />
                                      <ItemLabel>{metric.label}</ItemLabel>
                                  </ItemLabelWrapper>
                              </Tooltip2>
                          ),
                          nodeData: {
                              fieldId: fieldId(metric),
                              isDimension: false,
                          } as NodeDataProps,
                          isSelected: selectedNodes.has(fieldId(metric)),
                          secondaryLabel: (
                              <CustomMetricButtons
                                  node={metric}
                                  isHovered={hoveredFieldId === fieldId(metric)}
                                  isSelected={false}
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
        hasCaret: false,
        isExpanded: true,
        childNodes: [
            ...Object.entries(dimensionChildNodes.grouped)
                .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
                .map(([label, groupedDimensions]) =>
                    renderGroupNode(
                        `dimension_group.${label}`,
                        label,
                        groupedDimensions,
                        expandedNodes,
                        selectedNodes,
                        onOpenSourceDialog,
                        hoveredFieldId,
                    ),
                ),
            ...dimensionChildNodes.ungrouped
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((dimension) =>
                    renderDimensionTreeNode(
                        dimension,
                        expandedNodes,
                        selectedNodes,
                        onOpenSourceDialog,
                        hoveredFieldId,
                    ),
                ),
        ],
    };

    const contents: TreeNodeInfo<NodeDataProps>[] = hasMultipleTables
        ? [
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
                  childNodes: [metricNode, customMetricsNode, dimensionNode],
              },
          ]
        : [metricNode, customMetricsNode, dimensionNode];

    const handleNodeClick: TreeEventHandler<NodeDataProps> = useCallback(
        (node: TreeNodeInfo<NodeDataProps>, _nodePath: number[]) => {
            if (_nodePath.length !== 1 && node.nodeData) {
                onSelectedNodeChange(
                    node.nodeData.fieldId,
                    node.nodeData.isDimension,
                );
            } else if (node.childNodes && node.childNodes.length > 0) {
                setExpandedNodes((prevState) =>
                    toggleArrayValue(prevState, node.id),
                );
            }
        },
        [onSelectedNodeChange],
    );

    const onNodeMouseEnter: TreeEventHandler<NodeDataProps> = useCallback(
        (node, nodePath) => {
            if (nodePath.length > 1 && node.nodeData) {
                setHoveredFieldId(node.nodeData.fieldId);
            }
        },
        [setHoveredFieldId],
    );

    const onNodeMouseLeave: TreeEventHandler<NodeDataProps> = useCallback(
        () => setHoveredFieldId(''),
        [setHoveredFieldId],
    );

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <TableTreeGlobalStyle />
            <TreeWrapper hasMultipleTables={hasMultipleTables}>
                <Tree
                    contents={contents}
                    onNodeCollapse={(node) => {
                        setExpandedNodes((prevState) =>
                            prevState.filter((id) => id !== node.id),
                        );
                    }}
                    onNodeExpand={(node) => {
                        setExpandedNodes((prevState) => [
                            ...prevState,
                            node.id,
                        ]);
                    }}
                    onNodeClick={handleNodeClick}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                />
            </TreeWrapper>
        </TrackSection>
    );
};

export default TableTree;
