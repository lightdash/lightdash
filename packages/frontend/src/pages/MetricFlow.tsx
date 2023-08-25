import { subject } from '@casl/ability';
import { ActionIcon, Flex, Group, Stack, Text, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import React, { useCallback, useMemo, useState } from 'react';
import { ChartDownloadMenu } from '../components/ChartDownload';
import CollapsableCard from '../components/common/CollapsableCard';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import VisualizationConfigPanel from '../components/Explorer/VisualizationCard/VisualizationConfigPanel';
import VisualizationCardOptions from '../components/Explorer/VisualizationCardOptions';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { LoadingPanel } from '../components/MetricQueryData/UnderlyingDataModal.styles';
import MetricFlowFieldList from '../features/MetricFlow/components/MetricFlowFieldList';
import MetricFlowResultsTable from '../features/MetricFlow/components/ResultsTable';
import RunQueryButton from '../features/MetricFlow/components/RunQueryButton';
import { useMetricFlowFieldsAPI } from '../features/MetricFlow/hooks/useMetricFlowFieldsAPI';
import { useMetricFlowQueryAPI } from '../features/MetricFlow/hooks/useMetricFlowQueryAPI';
import { useMetricFlowQueryResultsAPI } from '../features/MetricFlow/hooks/useMetricFlowQueryResultsAPI';
import useSqlQueryVisualizationState from '../features/MetricFlow/hooks/useMetricFlowVisualizationState';
import convertFieldMapToTableColumns from '../features/MetricFlow/utils/convertFieldMapToTableColumns';
import convertMetricFlowFieldsToExplore from '../features/MetricFlow/utils/convertMetricFlowFieldsToExplore';
import convertMetricFlowQueryResultsToResultsData from '../features/MetricFlow/utils/convertMetricFlowQueryResultsToResultsData';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';

const MOCK_TABLE_NAME = 'metricflow';

const MetricFlowPage = () => {
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const metricFlowFieldsQuery = useMetricFlowFieldsAPI(activeProjectUuid, {
        metrics: selectedMetrics,
        dimensions: selectedDimensions,
    });
    const metricFlowQuery = useMetricFlowQueryAPI(activeProjectUuid, {
        metrics: selectedMetrics,
        dimensions: selectedDimensions,
    });
    const metricFlowQueryResultsQuery = useMetricFlowQueryResultsAPI(
        activeProjectUuid,
        metricFlowQuery.data?.createQuery.queryId,
    );

    const explore = useMemo(() => {
        if (!metricFlowFieldsQuery.data) {
            return undefined;
        }

        return convertMetricFlowFieldsToExplore(
            MOCK_TABLE_NAME,
            metricFlowFieldsQuery.data,
        );
    }, [metricFlowFieldsQuery.data]);

    const { resultsData, columns } = useMemo(() => {
        if (!explore || !metricFlowQueryResultsQuery.data?.query.jsonResult) {
            return { resultsData: undefined, columns: [] };
        }

        const results = convertMetricFlowQueryResultsToResultsData(
            explore,
            metricFlowQueryResultsQuery.data.query.jsonResult,
        );
        return {
            resultsData: results.resultsData,
            columns: convertFieldMapToTableColumns(results.fieldsMap),
        };
    }, [explore, metricFlowQueryResultsQuery.data]);
    const {
        chartType,
        columnOrder,
        setChartType,
        setChartConfig,
        setPivotFields,
    } = useSqlQueryVisualizationState(resultsData);

    const handleMetricSelect = useCallback(
        (metric: string) => {
            setSelectedMetrics((metrics) => {
                if (metrics.includes(metric)) {
                    return metrics.filter((m) => m !== metric);
                }
                return [...metrics, metric];
            });
        },
        [setSelectedMetrics],
    );

    const handleDimensionSelect = useCallback(
        (metric: string) => {
            setSelectedDimensions((dimensions) => {
                if (dimensions.includes(metric)) {
                    return dimensions.filter((m) => m !== metric);
                }
                return [...dimensions, metric];
            });
        },
        [setSelectedDimensions],
    );

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: project?.organizationUuid,
            projectUuid: project?.organizationUuid,
        }),
    );

    if (!project) {
        return <LoadingPanel />;
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
            sidebar={
                <Stack
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Group position="apart">
                        <PageBreadcrumbs
                            items={[{ title: 'MetricFlow', active: true }]}
                        />
                        <ActionIcon
                            size="sm"
                            variant="outline"
                            loading={metricFlowFieldsQuery.isFetching}
                            disabled={metricFlowFieldsQuery.isFetching}
                            onClick={() => metricFlowFieldsQuery.refetch()}
                        >
                            <IconRefresh />
                        </ActionIcon>
                    </Group>
                    <Stack mah="100%">
                        <Flex align="baseline" gap="xxs">
                            <Title order={5}>Metrics</Title>
                            <Text span fz="xs" color="gray.6">
                                (
                                {
                                    metricFlowFieldsQuery.data
                                        ?.metricsForDimensions.length
                                }
                                {selectedDimensions.length > 0 && (
                                    <> available based on selected dimensions</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <Stack sx={{ overflowY: 'auto', flex: 1 }}>
                            <MetricFlowFieldList
                                fields={
                                    metricFlowFieldsQuery.data
                                        ?.metricsForDimensions
                                }
                                selectedFields={selectedMetrics}
                                onClick={(name) => handleMetricSelect(name)}
                            />
                        </Stack>
                        <Flex align="baseline" gap="xxs">
                            <Title order={5}>Dimensions</Title>
                            <Text span fz="xs" color="gray.6">
                                ({metricFlowFieldsQuery.data?.dimensions.length}
                                {selectedMetrics.length > 0 && (
                                    <> available based on selected metrics</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <Stack sx={{ overflowY: 'auto', flex: 1 }}>
                            <MetricFlowFieldList
                                fields={metricFlowFieldsQuery.data?.dimensions}
                                selectedFields={selectedDimensions}
                                onClick={(name) => handleDimensionSelect(name)}
                            />
                        </Stack>
                    </Stack>
                </Stack>
            }
        >
            <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
                <Group position="apart">
                    <RunQueryButton
                        isLoading={
                            metricFlowQuery.isLoading ||
                            metricFlowQueryResultsQuery.isLoading
                        }
                        onClick={() => metricFlowQuery.refetch()}
                    />
                </Group>
            </TrackSection>
            <Stack mt="lg" spacing="sm" sx={{ flexGrow: 1 }}>
                <VisualizationProvider
                    initialChartConfig={undefined}
                    initialPivotDimensions={undefined}
                    chartType={chartType}
                    resultsData={resultsData}
                    isLoading={metricFlowQueryResultsQuery.isLoading}
                    onChartConfigChange={setChartConfig}
                    onChartTypeChange={setChartType}
                    onPivotDimensionsChange={setPivotFields}
                    columnOrder={columnOrder}
                    explore={explore}
                    isSqlRunner={true}
                >
                    <CollapsableCard
                        title="Charts"
                        rightHeaderElement={
                            <>
                                <VisualizationCardOptions />
                                <VisualizationConfigPanel
                                    chartType={chartType}
                                />
                                {activeProjectUuid && (
                                    <ChartDownloadMenu
                                        projectUuid={activeProjectUuid}
                                    />
                                )}
                            </>
                        }
                        isOpen={true}
                        shouldExpand
                        onToggle={() => undefined}
                    >
                        <LightdashVisualization className="sentry-block fs-block cohere-block" />
                    </CollapsableCard>
                </VisualizationProvider>

                <CollapsableCard
                    title="Results"
                    isOpen={true}
                    onToggle={() => undefined}
                >
                    <MetricFlowResultsTable
                        columns={columns}
                        resultsData={resultsData}
                        status={metricFlowQueryResultsQuery.status}
                        error={metricFlowQueryResultsQuery.error}
                    />
                </CollapsableCard>
            </Stack>
        </Page>
    );
};
export default MetricFlowPage;
