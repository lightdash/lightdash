import { Colors } from '@blueprintjs/core';
import { AdditionalMetric, CompiledTable, getItemId } from '@lightdash/common';
import React, { FC } from 'react';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { Row, TooltipContent } from './TableTree.styles';
import { TreeProvider } from './Tree/TreeProvider';
import TreeRoot from './Tree/TreeRoot';

type Props = {
    searchQuery?: string;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
    depth: number;
};
const TableTreeSections: FC<Props> = ({
    searchQuery,
    table,
    additionalMetrics,
    selectedItems,
    onSelectedNodeChange,
    depth,
}) => {
    const sectionDepth = depth;
    const treeRootDepth = depth + 1;
    const hasNoMetrics = Object.keys(table.metrics).length <= 0;
    return (
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
                <TreeProvider
                    searchQuery={searchQuery}
                    itemsMap={Object.values(table.dimensions).reduce(
                        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                        {},
                    )}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, true)}
                >
                    <TreeRoot depth={treeRootDepth} />
                </TreeProvider>
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
                <TreeProvider
                    searchQuery={searchQuery}
                    itemsMap={Object.values(table.metrics).reduce(
                        (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                        {},
                    )}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                >
                    <TreeRoot depth={treeRootDepth} />
                </TreeProvider>
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
                <TreeProvider
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
                </TreeProvider>
            )}
        </>
    );
};

export default TableTreeSections;
