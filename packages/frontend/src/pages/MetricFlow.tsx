import { subject } from '@casl/ability';
import {
    ECHARTS_DEFAULT_COLORS,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Flex,
    Group,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconPlayerPlay,
    IconRefresh,
    IconTrashX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { TimeGranularity } from '../api/MetricFlowAPI';
import { ChartDownloadMenu } from '../components/ChartDownload';
import CollapsableCard from '../components/common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../components/common/CollapsableCard/constants';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import VisualizationConfig from '../components/Explorer/VisualizationCard/VisualizationConfig';
import VisualizationCardOptions from '../components/Explorer/VisualizationCardOptions';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import MetricFlowFieldList from '../features/metricFlow/components/MetricFlowFieldList';
import MetricFlowSqlCard from '../features/metricFlow/components/MetricFlowSqlCard';
import MetricFlowResultsTable from '../features/metricFlow/components/ResultsTable';
import useMetricFlowQueryResults from '../features/metricFlow/hooks/useMetricFlowQueryResults';
import useMetricFlowVisualization from '../features/metricFlow/hooks/useMetricFlowVisualization';
import useSemanticLayerDimensions from '../features/metricFlow/hooks/useSemanticLayerDimensions';
import useSemanticLayerMetrics from '../features/metricFlow/hooks/useSemanticLayerMetrics';
import convertFieldMapToTableColumns from '../features/metricFlow/utils/convertFieldMapToTableColumns';
import convertMetricFlowFieldsToExplore from '../features/metricFlow/utils/convertMetricFlowFieldsToExplore';
import convertMetricFlowQueryResultsToResultsData from '../features/metricFlow/utils/convertMetricFlowQueryResultsToResultsData';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { type InfiniteQueryResults } from '../hooks/useQueryResults';
import useApp from '../providers/App/useApp';

const MOCK_TABLE_NAME = 'metricflow';

const MetricFlowPage = () => {
    const { showToastApiError } = useToaster();
    const { user, health } = useApp();
    const { data: org } = useOrganization();
    const { activeProjectUuid } = useActiveProjectUuid();
    const [selectedMetrics, setSelectedMetrics] = useState<Record<string, {}>>(
        {},
    );
    const [selectedDimensions, setSelectedDimensions] = useState<
        Record<string, { grain: TimeGranularity }>
    >({});
    const [isVisualizationConfigOpen, setIsVisualizationConfigOpen] =
        useState(false);
    const semanticLayerDimensionsQuery = useSemanticLayerDimensions(
        activeProjectUuid,
        selectedMetrics,
        {
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Error fetching dimensions',
                    apiError: error,
                });
                setSelectedMetrics({});
            },
        },
    );
    const semanticLayerMetricsQuery = useSemanticLayerMetrics(
        activeProjectUuid,
        selectedDimensions,
        {
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Error fetching metrics',
                    apiError: error,
                });
                setSelectedDimensions({});
            },
        },
    );
    const metricFlowQueryResultsQuery = useMetricFlowQueryResults(
        activeProjectUuid,
        {
            metrics: selectedMetrics,
            dimensions: selectedDimensions,
        },
        {
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Error generating query',
                    apiError: error,
                });
            },
        },
        {
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Error fetching results',
                    apiError: error,
                });
            },
        },
    );

    const explore = useMemo(() => {
        if (
            !semanticLayerDimensionsQuery.data ||
            !semanticLayerMetricsQuery.data
        ) {
            return undefined;
        }

        return convertMetricFlowFieldsToExplore(
            MOCK_TABLE_NAME,
            semanticLayerDimensionsQuery.data?.dimensions ?? [],
            semanticLayerMetricsQuery.data?.metricsForDimensions ?? [],
        );
    }, [semanticLayerDimensionsQuery.data, semanticLayerMetricsQuery.data]);

    const { resultsData: metricFlowResultsData, columns } = useMemo(() => {
        if (!explore || !metricFlowQueryResultsQuery.data?.query.jsonResult) {
            return { resultsData: undefined, columns: [] };
        }

        const results = convertMetricFlowQueryResultsToResultsData(
            explore,
            metricFlowQueryResultsQuery.data.query.jsonResult,
        );
        return {
            resultsData: results,
            columns: convertFieldMapToTableColumns(results.fields),
        };
    }, [explore, metricFlowQueryResultsQuery.data]);

    const {
        columnOrder,
        chartConfig,
        setChartType,
        setChartConfig,
        setPivotFields,
    } = useMetricFlowVisualization(metricFlowResultsData);

    const visualizationResultsData = useMemo<
        InfiniteQueryResults & {
            metricQuery?: MetricQuery;
            fields?: ItemsMap;
        }
    >(
        () => ({
            rows: metricFlowResultsData?.rows ?? [],
            isInitialLoading: metricFlowQueryResultsQuery.isLoading,
            isFetchingFirstPage: metricFlowQueryResultsQuery.isLoading,
            isFetchingRows: metricFlowQueryResultsQuery.isLoading,
            isFetchingAllPages: false,
            fetchMoreRows: () => undefined,
            setFetchAll: () => undefined,
            fetchAll: false,
            hasFetchedAllRows: true,
            totalClientFetchTimeMs: undefined,
            error: metricFlowQueryResultsQuery.error ?? null,
            projectUuid: activeProjectUuid,
            metricQuery: metricFlowResultsData?.metricQuery,
            fields: metricFlowResultsData?.fields,
        }),
        [
            metricFlowResultsData?.fields,
            metricFlowResultsData?.metricQuery,
            metricFlowResultsData?.rows,
            metricFlowQueryResultsQuery.error,
            metricFlowQueryResultsQuery.isLoading,
            activeProjectUuid,
        ],
    );

    const toggleVisualizationConfig = useCallback(
        () => setIsVisualizationConfigOpen((prev) => !prev),
        [],
    );

    const closeVisualizationConfig = useCallback(
        () => setIsVisualizationConfigOpen(false),
        [],
    );

    const handleMetricSelect = useCallback(
        (metric: string) => {
            setSelectedMetrics((prevState) => {
                if (!!prevState[metric]) {
                    delete prevState[metric];
                } else {
                    prevState[metric] = { grain: TimeGranularity.DAY };
                }
                return { ...prevState };
            });
        },
        [setSelectedMetrics],
    );

    const handleDimensionSelect = useCallback(
        (dimension: string) => {
            setSelectedDimensions((prevState) => {
                if (!!prevState[dimension]) {
                    delete prevState[dimension];
                } else {
                    prevState[dimension] = { grain: TimeGranularity.DAY };
                }
                return { ...prevState };
            });
        },
        [setSelectedDimensions],
    );

    const handleDimensionTimeGranularitySelect = useCallback(
        (dimension: string, timeGranularity: TimeGranularity) => {
            setSelectedDimensions((prevState) => {
                prevState[dimension] = { grain: timeGranularity };
                return { ...prevState };
            });
        },
        [setSelectedDimensions],
    );

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: user.data.organizationUuid,
            projectUuid: activeProjectUuid,
        }),
    );

    if (
        user.isInitialLoading ||
        !activeProjectUuid ||
        health.isInitialLoading ||
        !health.data
    ) {
        return <LoadingState title="Loading metricflow" />;
    }

    if (cannotViewProject) {
        return <ForbiddenPanel />;
    }
    return (
        <Page
            title="MetricFlow"
            withSidebarFooter
            withFullHeight
            withPaddedContent
            rightSidebar={
                isVisualizationConfigOpen ? (
                    <Stack spacing={0} h="100%" sx={{ flex: 1 }}>
                        <VisualizationConfig
                            chartType={chartConfig.type}
                            onClose={closeVisualizationConfig}
                        />
                    </Stack>
                ) : null
            }
            isRightSidebarOpen={isVisualizationConfigOpen}
            sidebar={
                <Stack
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Group position="apart">
                        <Flex gap="xs">
                            <PageBreadcrumbs
                                items={[
                                    {
                                        title: 'dbt Semantic Layer',
                                        active: true,
                                    },
                                ]}
                            />
                            <Tooltip
                                multiline
                                label={`The dbt Semantic Layer integration is in beta and may be unstable`}
                            >
                                <Badge size="sm" variant="light">
                                    BETA
                                </Badge>
                            </Tooltip>
                        </Flex>
                        <Button.Group>
                            <Tooltip
                                label={'Run query'}
                                withinPortal
                                position="bottom"
                            >
                                <Button
                                    size="xs"
                                    variant="default"
                                    disabled={
                                        metricFlowQueryResultsQuery.isLoading
                                    }
                                    onClick={() =>
                                        metricFlowQueryResultsQuery.refetch()
                                    }
                                >
                                    <IconPlayerPlay size={12} color="blue" />
                                </Button>
                            </Tooltip>
                            <Tooltip
                                label={'Refetch fields'}
                                withinPortal
                                position="bottom"
                            >
                                <Button
                                    size="xs"
                                    variant="default"
                                    disabled={
                                        semanticLayerDimensionsQuery.isFetching ||
                                        semanticLayerMetricsQuery.isFetching
                                    }
                                    onClick={() => {
                                        void semanticLayerDimensionsQuery.refetch();
                                        void semanticLayerMetricsQuery.refetch();
                                    }}
                                >
                                    <IconRefresh size={12} />
                                </Button>
                            </Tooltip>
                            <Tooltip
                                label={'Clear selected fields'}
                                withinPortal
                                position="bottom"
                            >
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() => {
                                        setSelectedMetrics({});
                                        setSelectedDimensions({});
                                    }}
                                >
                                    <IconTrashX size={12} color="red" />
                                </Button>
                            </Tooltip>
                        </Button.Group>
                    </Group>
                    <Stack mah="100%" sx={{ overflow: 'hidden' }}>
                        <Flex align="baseline" gap="xxs">
                            <Title order={5} color="yellow.9">
                                Metrics
                            </Title>
                            <Text span fz="xs" color="gray.6">
                                (
                                {semanticLayerMetricsQuery.data
                                    ?.metricsForDimensions.length ?? 0}
                                {Object.keys(selectedDimensions).length > 0 && (
                                    <> available based on selected dimensions</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <ScrollArea offsetScrollbars sx={{ flex: 1 }}>
                            <MetricFlowFieldList
                                disabled={semanticLayerMetricsQuery.isFetching}
                                fields={
                                    semanticLayerMetricsQuery.data
                                        ?.metricsForDimensions
                                }
                                selectedFields={selectedMetrics}
                                onClick={(name) => handleMetricSelect(name)}
                            />
                        </ScrollArea>
                        <Flex align="baseline" gap="xxs">
                            <Title order={5} color="blue.9">
                                Dimensions
                            </Title>
                            <Text span fz="xs" color="gray.6">
                                (
                                {semanticLayerDimensionsQuery.data?.dimensions
                                    .length ?? 0}
                                {Object.keys(selectedMetrics).length > 0 && (
                                    <> available based on selected metrics</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <ScrollArea offsetScrollbars sx={{ flex: 1 }}>
                            <MetricFlowFieldList
                                disabled={
                                    semanticLayerDimensionsQuery.isFetching
                                }
                                fields={
                                    semanticLayerDimensionsQuery.data
                                        ?.dimensions
                                }
                                selectedFields={selectedDimensions}
                                onClick={(name) => handleDimensionSelect(name)}
                                onClickTimeGranularity={
                                    handleDimensionTimeGranularitySelect
                                }
                            />
                        </ScrollArea>
                    </Stack>
                </Stack>
            }
        >
            <Stack spacing="sm" sx={{ flexGrow: 1 }}>
                <VisualizationProvider
                    chartConfig={chartConfig}
                    initialPivotDimensions={undefined}
                    resultsData={visualizationResultsData}
                    isLoading={metricFlowQueryResultsQuery.isLoading}
                    onChartConfigChange={setChartConfig}
                    onChartTypeChange={setChartType}
                    onPivotDimensionsChange={setPivotFields}
                    columnOrder={columnOrder}
                    pivotTableMaxColumnLimit={
                        health.data.pivotTable.maxColumnLimit
                    }
                    colorPalette={org?.chartColors ?? ECHARTS_DEFAULT_COLORS}
                >
                    <CollapsableCard
                        title="Charts"
                        rightHeaderElement={
                            <>
                                <VisualizationCardOptions />
                                <Button
                                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                    onClick={toggleVisualizationConfig}
                                    rightIcon={
                                        <MantineIcon
                                            icon={
                                                isVisualizationConfigOpen
                                                    ? IconLayoutSidebarLeftCollapse
                                                    : IconLayoutSidebarLeftExpand
                                            }
                                        />
                                    }
                                >
                                    {isVisualizationConfigOpen
                                        ? 'Close configure'
                                        : 'Configure'}
                                </Button>
                                {activeProjectUuid && (
                                    <ChartDownloadMenu
                                        projectUuid={activeProjectUuid}
                                    />
                                )}
                            </>
                        }
                        isOpen={true}
                        isVisualizationCard
                        onToggle={() => undefined}
                    >
                        <LightdashVisualization className="sentry-block ph-no-capture" />
                    </CollapsableCard>
                </VisualizationProvider>

                <CollapsableCard
                    title="Results"
                    isOpen={true}
                    onToggle={() => undefined}
                >
                    <MetricFlowResultsTable
                        columns={columns}
                        resultsData={metricFlowResultsData}
                        status={metricFlowQueryResultsQuery.status}
                        error={metricFlowQueryResultsQuery.error}
                    />
                </CollapsableCard>
                <MetricFlowSqlCard
                    projectUuid={activeProjectUuid}
                    status={metricFlowQueryResultsQuery.status}
                    sql={metricFlowQueryResultsQuery.data?.query.sql}
                    error={metricFlowQueryResultsQuery.error}
                    canRedirectToSqlRunner={user.data?.ability?.can(
                        'manage',
                        subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: activeProjectUuid,
                        }),
                    )}
                />
            </Stack>
        </Page>
    );
};
export default MetricFlowPage;
