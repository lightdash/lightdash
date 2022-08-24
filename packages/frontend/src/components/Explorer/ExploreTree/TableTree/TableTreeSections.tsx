import { Colors } from '@blueprintjs/core';
import { AdditionalMetric, CompiledTable, getItemId } from '@lightdash/common';
import React, { FC } from 'react';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import {
    CustomMetricsSectionRow,
    DimensionsSectionRow,
    EmptyState,
    MetricsSectionRow,
    SpanFlex,
    TooltipContent,
} from './TableTree.styles';
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
            <DimensionsSectionRow depth={sectionDepth}>
                Dimensions
            </DimensionsSectionRow>
            {Object.keys(table.dimensions).length <= 0 ? (
                <EmptyState>
                    No dimensions defined in your dbt project
                </EmptyState>
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
            <MetricsSectionRow depth={sectionDepth}>
                Metrics
                <SpanFlex />
                {hasNoMetrics && (
                    <DocumentationHelpButton
                        url={
                            'https://docs.lightdash.com/guides/how-to-create-metrics'
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
            </MetricsSectionRow>
            {hasNoMetrics ? (
                <EmptyState>No metrics defined in your dbt project</EmptyState>
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
            <CustomMetricsSectionRow depth={sectionDepth}>
                Custom metrics
                <SpanFlex />
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
            </CustomMetricsSectionRow>
            {hasNoMetrics && additionalMetrics.length <= 0 ? (
                <EmptyState>
                    Add custom metrics by hovering over the dimension of your
                    choice & selecting the three-dot Action Menu
                </EmptyState>
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
