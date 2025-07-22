import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    getItemId,
    isCustomSqlDimension,
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Center,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCode, IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { useGitIntegration } from '../../../../hooks/gitIntegration/useGitIntegration';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import useExplorerContext from '../../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import MantineIcon from '../../../common/MantineIcon';
import { TreeProvider } from './Tree/TreeProvider';
import TreeRoot from './Tree/TreeRoot';

type Props = {
    searchQuery?: string;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
    customDimensions?: CustomDimension[];
    missingFields?: {
        all: string[];
        customDimensions: CustomDimension[] | undefined;
        customMetrics: AdditionalMetric[] | undefined;
    };
    selectedDimensions?: string[];
    searchResults: string[];
    isSearching: boolean;
};
const TableTreeSections: FC<Props> = ({
    searchQuery,
    table,
    additionalMetrics,
    customDimensions,
    selectedItems,
    missingFields,
    selectedDimensions,
    onSelectedNodeChange,
    searchResults,
    isSearching,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { track } = useTracking();
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
    const toggleWriteBackModal = useExplorerContext(
        (context) => context.actions.toggleWriteBackModal,
    );

    const allAdditionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const allCustomDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
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

        return [
            ...customMetricsTable,
            ...(missingFields?.customMetrics ?? []),
        ].reduce<Record<string, AdditionalMetric>>(
            (acc, item) => ({ ...acc, [getItemId(item)]: item }),
            {},
        );
    }, [additionalMetrics, missingFields?.customMetrics, table.name]);

    const customDimensionsMap = useMemo(() => {
        if (customDimensions === undefined) return undefined;
        return customDimensions
            .filter((customDimension) => customDimension.table === table.name)
            .reduce<Record<string, CustomDimension>>(
                (acc, item) => ({ ...acc, [getItemId(item)]: item }),
                {},
            );
    }, [customDimensions, table]);

    const hasMetrics = Object.keys(table.metrics).length > 0;
    const hasDimensions = Object.keys(table.dimensions).length > 0;
    const hasCustomMetrics = additionalMetrics.length > 0;
    const hasCustomDimensions = customDimensions && customDimensions.length > 0;

    const { data: project } = useProject(projectUuid);

    const isGithubProject =
        project?.dbtConnection.type === DbtProjectType.GITHUB;
    const { data: gitIntegration } = useGitIntegration();

    const isWriteBackCustomBinDimensionsEnabled = useFeatureFlagEnabled(
        FeatureFlags.WriteBackCustomBinDimensions,
    );
    const customDimensionsToWriteBack = isWriteBackCustomBinDimensionsEnabled
        ? allCustomDimensions
        : allCustomDimensions?.filter(isCustomSqlDimension);
    const hasCustomDimensionsToWriteBack =
        customDimensionsToWriteBack && customDimensionsToWriteBack.length > 0;

    const customMetricsIssues: {
        [id: string]: {
            errors: { message: string }[];
        };
    } = useMemo(() => {
        return additionalMetrics.reduce((acc, item) => {
            const foundDuplicateId = Object.keys(metrics).includes(
                getItemId(item),
            );
            return {
                ...acc,
                [getItemId(item)]: {
                    errors: foundDuplicateId
                        ? [
                              `A metric with this ID already exists in the table. Rename your custom metric to prevent conflicts.`,
                          ]
                        : undefined,
                },
            };
        }, {});
    }, [metrics, additionalMetrics]);

    const handleItemClickDimension = useCallback(
        (key: string) => onSelectedNodeChange(key, true),
        [onSelectedNodeChange],
    );

    const handleItemClickMetric = useCallback(
        (key: string) => onSelectedNodeChange(key, false),
        [onSelectedNodeChange],
    );

    const handleAddCustomDimension = useCallback(() => {
        toggleCustomDimensionModal({
            isEditing: false,
            table: table.name,
            item: undefined,
        });
    }, [toggleCustomDimensionModal, table.name]);

    const handleWriteBackCustomMetrics = useCallback(() => {
        if (projectUuid && user.data?.organizationUuid) {
            track({
                name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_HEADER_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    projectId: projectUuid,
                    organizationId: user.data.organizationUuid,
                    customMetricsCount: allAdditionalMetrics?.length || 0,
                    customDimensionsCount: 0,
                },
            });
        }
        toggleWriteBackModal({ items: allAdditionalMetrics });
    }, [
        projectUuid,
        user.data,
        allAdditionalMetrics,
        toggleWriteBackModal,
        track,
    ]);

    const handleWriteBackCustomDimensions = useCallback(() => {
        if (projectUuid && user.data?.organizationUuid) {
            track({
                name: EventName.WRITE_BACK_FROM_CUSTOM_DIMENSION_HEADER_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    projectId: projectUuid,
                    organizationId: user.data.organizationUuid,
                    customMetricsCount: 0,
                    customDimensionsCount:
                        customDimensionsToWriteBack?.length || 0,
                },
            });
        }
        toggleWriteBackModal({
            items: customDimensionsToWriteBack || [],
        });
    }, [
        projectUuid,
        user.data,
        customDimensionsToWriteBack,
        toggleWriteBackModal,
        track,
    ]);

    const getMissingFieldClickHandler = useCallback(
        (field: string) => () => {
            const isDimension = !!selectedDimensions?.includes(field);
            onSelectedNodeChange(field, isDimension);
        },
        [onSelectedNodeChange, selectedDimensions],
    );

    return (
        <>
            {missingFields && missingFields.all.length > 0 && (
                <>
                    <Group mt="sm" mb="xs">
                        <Text fw={600} color="gray.6">
                            Missing fields
                        </Text>
                    </Group>

                    {missingFields.all.map((missingField) => {
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
                                    onClick={getMissingFieldClickHandler(
                                        missingField,
                                    )}
                                    ml={12}
                                    my="xs"
                                    sx={{ cursor: 'pointer' }}
                                    noWrap
                                    spacing="sm"
                                >
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        color="yellow.9"
                                        style={{ flexShrink: 0 }}
                                    />

                                    <Text truncate>{missingField}</Text>
                                </Group>
                            </Tooltip>
                        );
                    })}
                </>
            )}

            {isSearching && searchResults.length === 0 ? null : (
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
                                onClick={handleAddCustomDimension}
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
                    groupDetails={table.groupDetails}
                    onItemClick={handleItemClickDimension}
                    searchResults={searchResults}
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

            {isSearching && searchResults.length === 0 ? null : (
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
                    groupDetails={table.groupDetails}
                    onItemClick={handleItemClickMetric}
                    searchResults={searchResults}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}

            {hasCustomMetrics &&
            !(isSearching && searchResults.length === 0) ? (
                <Group position="apart" mt="sm" mb="xs" pr="sm">
                    <Group>
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
                    {hasCustomMetrics && (
                        <Tooltip label="Write back custom metrics">
                            <ActionIcon onClick={handleWriteBackCustomMetrics}>
                                <MantineIcon icon={IconCode} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            ) : null}

            {!hasMetrics || hasCustomMetrics ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={customMetrics}
                    selectedItems={selectedItems}
                    missingCustomMetrics={missingFields?.customMetrics}
                    itemsAlerts={customMetricsIssues}
                    groupDetails={table.groupDetails}
                    onItemClick={handleItemClickMetric}
                    isGithubIntegrationEnabled={isGithubProject}
                    gitIntegration={gitIntegration}
                    searchResults={searchResults}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}

            {hasCustomDimensions &&
            customDimensionsMap &&
            !(isSearching && searchResults.length === 0) ? (
                <Group position="apart" mt="sm" mb="xs" pr="sm">
                    <Group>
                        <Text fw={600} color="blue.9">
                            Custom dimensions
                        </Text>

                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-metrics#-adding-custom-metrics-in-the-explore-view"
                            tooltipProps={{
                                label: (
                                    <>
                                        Add custom dimensions by hovering over
                                        the dimension of your choice & selecting
                                        the three-dot Action Menu.{' '}
                                        <Text component="span" fw={600}>
                                            Click to view docs.
                                        </Text>
                                    </>
                                ),
                                multiline: true,
                            }}
                        />
                    </Group>
                    {hasCustomDimensionsToWriteBack && (
                        <Tooltip label="Write back custom dimensions">
                            <ActionIcon
                                onClick={handleWriteBackCustomDimensions}
                            >
                                <MantineIcon icon={IconCode} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            ) : null}

            {hasCustomDimensions && customDimensionsMap ? (
                <TreeProvider
                    orderFieldsBy={table.orderFieldsBy}
                    searchQuery={searchQuery}
                    itemsMap={customDimensionsMap}
                    missingCustomDimensions={missingFields?.customDimensions}
                    selectedItems={selectedItems}
                    groupDetails={table.groupDetails}
                    onItemClick={handleItemClickDimension}
                    searchResults={searchResults}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}
        </>
    );
};

export default TableTreeSections;
