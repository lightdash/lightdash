import { Colors } from '@blueprintjs/core';
import { AdditionalMetric, CompiledTable, getItemId } from '@lightdash/common';
import { Box, Center, Group, NavLink, Stack, Text } from '@mantine/core';
import { FC, useMemo } from 'react';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { getSearchResults, TreeProvider } from './Tree/TreeProvider';
import TreeRoot from './Tree/TreeRoot';

type Props = {
    searchQuery?: string;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
};
const TableTreeSections: FC<Props> = ({
    searchQuery,
    table,
    additionalMetrics,
    selectedItems,
    onSelectedNodeChange,
}) => {
    const isSearching = !!searchQuery && searchQuery !== '';

    const hasNoMetrics = Object.keys(table.metrics).length === 0;

    const dimensions = useMemo(() => {
        return Object.values(table.dimensions).reduce(
            (acc, item) => ({ ...acc, [getItemId(item)]: item }),
            {},
        );
    }, [table.dimensions]);

    const metrics = useMemo(() => {
        return Object.values(table.metrics).reduce(
            (acc, item) => ({ ...acc, [getItemId(item)]: item }),
            {},
        );
    }, [table.metrics]);

    const customMetrics = useMemo(() => {
        return additionalMetrics.reduce<Record<string, AdditionalMetric>>(
            (acc, item) => ({ ...acc, [getItemId(item)]: item }),
            {},
        );
    }, [additionalMetrics]);

    return (
        <>
            {isSearching &&
            getSearchResults(dimensions, searchQuery).size === 0 ? null : (
                <>
                    <Group h="xxl">
                        <Text fw={600} color="blue.9">
                            Dimensions
                        </Text>
                    </Group>

                    {Object.keys(table.dimensions).length <= 0 ? (
                        <Center>
                            <Text color="dimmed">
                                No dimensions defined in your dbt project
                            </Text>
                        </Center>
                    ) : (
                        <TreeProvider
                            orderFieldsBy={table.orderFieldsBy}
                            searchQuery={searchQuery}
                            itemsMap={dimensions}
                            selectedItems={selectedItems}
                            onItemClick={(key) =>
                                onSelectedNodeChange(key, true)
                            }
                        >
                            <TreeRoot />
                        </TreeProvider>
                    )}
                </>
            )}

            {isSearching &&
            getSearchResults(metrics, searchQuery).size === 0 ? null : (
                <>
                    <Group position="apart" h="xxl">
                        <Text fw={600} color="yellow.9">
                            Metrics
                        </Text>

                        {hasNoMetrics ? (
                            <DocumentationHelpButton
                                href="https://docs.lightdash.com/guides/how-to-create-metrics"
                                tooltipProps={{
                                    label: (
                                        <>
                                            No metrics defined in your dbt
                                            project.
                                            <br />
                                            Click to{' '}
                                            <Text component="span" fw={600}>
                                                view docs
                                            </Text>{' '}
                                            and learn how to add a metric to
                                            your project.
                                        </>
                                    ),
                                    multiline: true,
                                }}
                                iconProps={{
                                    style: {
                                        color: Colors.GRAY3,
                                    },
                                }}
                            />
                        ) : null}
                    </Group>

                    {hasNoMetrics ? null : (
                        <TreeProvider
                            orderFieldsBy={table.orderFieldsBy}
                            searchQuery={searchQuery}
                            itemsMap={metrics}
                            selectedItems={selectedItems}
                            onItemClick={(key) =>
                                onSelectedNodeChange(key, false)
                            }
                        >
                            <TreeRoot />
                        </TreeProvider>
                    )}
                </>
            )}

            {isSearching &&
            getSearchResults(customMetrics, searchQuery).size === 0 ? null : (
                <>
                    <Group position="apart" h="xxl">
                        <Text fw={600} color="yellow.9">
                            Custom metrics
                        </Text>

                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view"
                            tooltipProps={{
                                label: (
                                    <>
                                        Add custom metrics by hovering over the
                                        dimension of your choice & selecting the
                                        three-dot Action Menu.{' '}
                                        <Text component="span" fw={600}>
                                            Click to view docs.
                                        </Text>
                                    </>
                                ),
                                multiline: true,
                            }}
                            iconProps={{
                                style: {
                                    color: Colors.GRAY3,
                                },
                            }}
                        />
                    </Group>

                    {hasNoMetrics || additionalMetrics.length > 0 ? (
                        <TreeProvider
                            orderFieldsBy={table.orderFieldsBy}
                            searchQuery={searchQuery}
                            itemsMap={customMetrics}
                            selectedItems={selectedItems}
                            onItemClick={(key) =>
                                onSelectedNodeChange(key, false)
                            }
                        >
                            <TreeRoot />
                        </TreeProvider>
                    ) : null}
                </>
            )}
        </>
    );
};

export default TableTreeSections;
