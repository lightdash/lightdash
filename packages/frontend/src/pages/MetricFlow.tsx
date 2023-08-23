import { subject } from '@casl/ability';
import { Flex, NavLink, Stack, Text, Title } from '@mantine/core';
import { Icon123 } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { ChartDownloadMenu } from '../components/ChartDownload';
import CollapsableCard from '../components/common/CollapsableCard';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import VisualizationConfigPanel from '../components/Explorer/VisualizationCard/VisualizationConfigPanel';
import VisualizationCardOptions from '../components/Explorer/VisualizationCardOptions';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { LoadingPanel } from '../components/MetricQueryData/UnderlyingDataModal.styles';
import MetricFlowResultsTable from '../features/components/ResultsTable';
import { useMetricFlowFieldsAPI } from '../features/hooks/useMetricFlowFieldsAPI';
import { useMetricFlowQueryAPI } from '../features/hooks/useMetricFlowQueryAPI';
import { useMetricFlowQueryResultsAPI } from '../features/hooks/useMetricFlowQueryResultsAPI';
import useSqlQueryVisualizationState from '../features/hooks/useMetricFlowVisualizationState';
import convertMetricFlowFieldsToExplore from '../features/utils/convertMetricFlowFieldsToExplore';
import convertMetricFlowQueryResultsToResultsData from '../features/utils/convertMetricFlowQueryResultsToResultsData';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';

const MOCK_TABLE_NAME = 'metricflow';

const MetricFlowPage = () => {
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const { data } = useMetricFlowFieldsAPI(activeProjectUuid, {
        metrics: selectedMetrics,
        dimensions: selectedDimensions,
    });
    const { data: query } = useMetricFlowQueryAPI(activeProjectUuid, {
        metrics: selectedMetrics,
        dimensions: selectedDimensions,
    });
    const metricFlowQueryResultsQuery = useMetricFlowQueryResultsAPI(
        activeProjectUuid,
        query?.createQuery.queryId,
    );

    const explore = useMemo(() => {
        if (!data) {
            return undefined;
        }

        return convertMetricFlowFieldsToExplore(MOCK_TABLE_NAME, data);
    }, [data]);

    const { resultsData, fieldsMap } = useMemo(() => {
        if (!explore || !metricFlowQueryResultsQuery.data?.query.jsonResult) {
            return { resultsData: undefined, fieldsMap: {} };
        }

        return convertMetricFlowQueryResultsToResultsData(
            explore,
            metricFlowQueryResultsQuery.data.query.jsonResult,
        );
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
                    <PageBreadcrumbs
                        items={[{ title: 'MetricFlow', active: true }]}
                    />
                    <Stack mah="100%">
                        <Flex align="baseline" gap="xxs">
                            <Title order={5}>Metrics</Title>
                            <Text span fz="xs" color="gray.6">
                                ({data?.metricsForDimensions.length}
                                {selectedDimensions.length > 0 && (
                                    <> available based on selected dimensions</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <Stack sx={{ overflowY: 'auto', flex: 1 }}>
                            {data?.metricsForDimensions?.map((metric) => (
                                <NavLink
                                    key={metric.name}
                                    active={selectedMetrics.includes(
                                        metric.name,
                                    )}
                                    icon={
                                        <MantineIcon
                                            icon={Icon123}
                                            size="lg"
                                            color="gray.7"
                                        />
                                    }
                                    label={metric.name}
                                    description={metric.description}
                                    onClick={() =>
                                        handleMetricSelect(metric.name)
                                    }
                                />
                            ))}
                        </Stack>
                        <Flex align="baseline" gap="xxs">
                            <Title order={5}>Dimensions</Title>
                            <Text span fz="xs" color="gray.6">
                                ({data?.dimensions.length}
                                {selectedMetrics.length > 0 && (
                                    <> available based on selected metrics</>
                                )}
                                )
                            </Text>
                        </Flex>
                        <Stack sx={{ overflowY: 'auto', flex: 1 }}>
                            {data?.dimensions?.map((dimension) => (
                                <NavLink
                                    key={dimension.name}
                                    active={selectedDimensions.includes(
                                        dimension.name,
                                    )}
                                    icon={
                                        <MantineIcon
                                            icon={Icon123}
                                            size="lg"
                                            color="gray.7"
                                        />
                                    }
                                    label={dimension.name}
                                    description={dimension.description}
                                    onClick={() =>
                                        handleDimensionSelect(dimension.name)
                                    }
                                />
                            ))}
                        </Stack>
                    </Stack>
                </Stack>
            }
        >
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
                        resultsData={resultsData}
                        fieldsMap={fieldsMap}
                        status={metricFlowQueryResultsQuery.status}
                        error={metricFlowQueryResultsQuery.error}
                    />
                </CollapsableCard>
            </Stack>
        </Page>
    );
};
export default MetricFlowPage;
