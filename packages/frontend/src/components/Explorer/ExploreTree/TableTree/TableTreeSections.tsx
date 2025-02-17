import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    getItemId,
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
import { useMemo, type FC } from 'react';
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
import { getSearchResults } from './Tree/utils';

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
    const toggleAdditionalMetricWriteBackModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricWriteBackModal,
    );

    const allAdditionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
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

    const isSearching = !!searchQuery && searchQuery !== '';

    const hasMetrics = Object.keys(table.metrics).length > 0;
    const hasDimensions = Object.keys(table.dimensions).length > 0;
    const hasCustomMetrics = additionalMetrics.length > 0;
    const hasCustomDimensions = customDimensions && customDimensions.length > 0;

    const { data: project } = useProject(projectUuid);

    const isGithubProject =
        project?.dbtConnection.type === DbtProjectType.GITHUB;
    const { data: gitIntegration } = useGitIntegration();
    const isCustomSqlEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomSQLEnabled,
    );

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
                    groupDetails={table.groupDetails}
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
                    groupDetails={table.groupDetails}
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
                    {isCustomSqlEnabled && (
                        <Tooltip label="Write back custom metrics">
                            <ActionIcon
                                onClick={() => {
                                    if (
                                        projectUuid &&
                                        user.data?.organizationUuid
                                    ) {
                                        track({
                                            name: EventName.WRITE_BACK_FROM_CUSTOM_METRIC_HEADER_CLICKED,
                                            properties: {
                                                userId: user.data.userUuid,
                                                projectId: projectUuid,
                                                organizationId:
                                                    user.data.organizationUuid,
                                                customMetricsCount:
                                                    allAdditionalMetrics?.length ||
                                                    0,
                                            },
                                        });
                                    }
                                    toggleAdditionalMetricWriteBackModal({
                                        items: allAdditionalMetrics || [],
                                        multiple: true,
                                    });
                                }}
                            >
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
                    onItemClick={(key) => onSelectedNodeChange(key, false)}
                    isGithubIntegrationEnabled={
                        isGithubProject && isCustomSqlEnabled
                    }
                    gitIntegration={gitIntegration}
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
                    missingCustomDimensions={missingFields?.customDimensions}
                    selectedItems={selectedItems}
                    groupDetails={table.groupDetails}
                    onItemClick={(key) => onSelectedNodeChange(key, true)}
                >
                    <TreeRoot />
                </TreeProvider>
            ) : null}
        </>
    );
};

export default TableTreeSections;
