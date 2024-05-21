import { subject } from '@casl/ability';
import {
    getItemId,
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
} from '@lightdash/common';
import { Button, Center, Group, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../../providers/AppProvider';
import { useExplorerContext } from '../../../../providers/ExplorerProvider';
import MantineIcon from '../../../common/MantineIcon';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { getSearchResults, TreeProvider } from './Tree/TreeProvider';
import TreeRoot from './Tree/TreeRoot';

type Props = {
    searchQuery?: string;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
    missingCustomMetrics: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    missingCustomDimensions?: CustomDimension[];
    missingFields?: string[];
    selectedDimensions?: string[];
};
const TableTreeSections: FC<Props> = ({
    searchQuery,
    table,
    additionalMetrics,
    customDimensions,
    selectedItems,
    missingCustomMetrics,
    missingCustomDimensions,
    missingFields,
    selectedDimensions,
    onSelectedNodeChange,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const canManageCustomSql = user.data?.ability?.can(
        'manage',
        subject('CustomSql', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );
    const toggleCustomDimensionModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );

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
        const customMetricsTable = additionalMetrics.filter(
            (metric) => metric.table === table.name,
        );

        return [...customMetricsTable, ...missingCustomMetrics].reduce<
            Record<string, AdditionalMetric>
        >((acc, item) => ({ ...acc, [getItemId(item)]: item }), {});
    }, [additionalMetrics, , missingCustomMetrics, table]);

    const customDimensionsMap = useMemo(() => {
        if (customDimensions === undefined) return undefined;
        return customDimensions
            .filter((customDimension) => customDimension.table === table.name)
            .reduce<Record<string, CustomDimension>>(
                (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                {},
            );
    }, [customDimensions, table]);

    const isSearching = !!searchQuery && searchQuery !== '';

    const hasMetrics = Object.keys(table.metrics).length > 0;
    const hasDimensions = Object.keys(table.dimensions).length > 0;
    const hasCustomMetrics = additionalMetrics.length > 0;
    const hasCustomDimensions = customDimensions && customDimensions.length > 0;

    return (
        <>
            {missingFields && missingFields.length > 0 && (
                <>
                    {' '}
                    <Group mt="sm" mb="xs">
                        <Text fw={600} color="gray.6">
                            Missing fields
                        </Text>
                    </Group>
                    {missingFields.map((missingField) => {
                        return (
                            <Tooltip
                                key={missingField}
                                withinPortal
                                sx={{ whiteSpace: 'normal' }}
                                label={`Field ${missingField} not found on this chart. Click here to remove it.`}
                                position="bottom-start"
                                maw={700}
                            >
                                <Group
                                    onClick={() => {
                                        const isDimension =
                                            !!selectedDimensions?.includes(
                                                missingField,
                                            );
                                        onSelectedNodeChange(
                                            missingField,
                                            isDimension,
                                        );
                                    }}
                                    ml={12}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        color="yellow.9"
                                        style={{ flexShrink: 0 }}
                                    />
                                    <Text>{missingField}</Text>
                                </Group>
                            </Tooltip>
                        );
                    })}
                </>
            )}
            {isSearching &&
            getSearchResults(dimensions, searchQuery).size === 0 ? null : (
                <Group mt="sm" mb="xs" position={'apart'}>
                    <Text fw={600} color="blue.9">
                        Dimensions
                    </Text>

                    {canManageCustomSql && (
                        <Tooltip
                            label="Add a custom dimension with SQL"
                            variant="xs"
                        >
                            <Button
                                size="xs"
                                variant={'subtle'}
                                compact
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() =>
                                    toggleCustomDimensionModal({
                                        isEditing: false,
                                        table: table.name,
                                        item: undefined,
                                    })
                                }
                            >
                                Add
                            </Button>
                        </Tooltip>
                    )}
                </Group>
            )}

            {hasDimensions ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={dimensions}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, true)}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : (
                <Center pt="sm" pb="md">
                    <Text color="dimmed">
                        No dimensions defined in your dbt project
                    </Text>
                </Center>
            )}

            {isSearching &&
            getSearchResults(metrics, searchQuery).size === 0 ? null : (
                <Group position="apart" mt="sm" mb="xs" pr="sm">
                    <Text fw={600} color="yellow.9">
                        Metrics
                    </Text>

                    {hasMetrics ? null : (
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-metrics"
                            tooltipProps={{
                                label: (
                                    <>
                                        No metrics defined in your dbt project.
                                        <br />
                                        Click to{' '}
                                        <Text component="span" fw={600}>
                                            view docs
                                        </Text>{' '}
                                        and learn how to add a metric to your
                                        project.
                                    </>
                                ),
                                multiline: true,
                            }}
                        />
                    )}
                </Group>
            )}

            {hasMetrics ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={metrics}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}

            {hasCustomMetrics &&
            !(
                isSearching &&
                getSearchResults(customMetrics, searchQuery).size === 0
            ) ? (
                <Group position="apart" mt="sm" mb="xs" pr="sm">
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
                    />
                </Group>
            ) : null}

            {!hasMetrics || hasCustomMetrics ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={customMetrics}
                    selectedItems={selectedItems}
                    missingCustomMetrics={missingCustomMetrics}
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}

            {hasCustomDimensions &&
            customDimensionsMap &&
            !(
                isSearching &&
                getSearchResults(customDimensionsMap, searchQuery).size === 0
            ) ? (
                <Group position="apart" mt="sm" mb="xs" pr="sm">
                    <Text fw={600} color="blue.9">
                        Custom dimensions
                    </Text>

                    <DocumentationHelpButton
                        href="https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view"
                        tooltipProps={{
                            label: (
                                <>
                                    Add custom dimensions by hovering over the
                                    dimension of your choice & selecting the
                                    three-dot Action Menu.{' '}
                                    <Text component="span" fw={600}>
                                        Click to view docs.
                                    </Text>
                                </>
                            ),
                            multiline: true,
                        }}
                    />
                </Group>
            ) : null}

            {hasCustomDimensions && customDimensionsMap ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={customDimensionsMap}
                    missingCustomDimensions={missingCustomDimensions}
                    selectedItems={selectedItems}
                    onItemClick={(key) => onSelectedNodeChange(key, true)}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}
        </>
    );
};

export default TableTreeSections;
