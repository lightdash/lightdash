import {
    AiChartType,
    assertUnreachable,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type AiAgentMessageAssistant,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
} from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack } from '@mantine-8/core';
import { type QueryObserverSuccessResult } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';
import { type EchartSeriesClickEvent } from '../../../../../components/SimpleChart';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { type EChartSeries } from '../../../../../hooks/echarts/useEchartsCartesianConfig';
import useHealth from '../../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../../hooks/organization/useOrganization';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { getChartConfigFromAiAgentVizConfig } from '../../utils/echarts';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { AiChartToolCalls } from './ToolCalls/AiChartToolCalls';

type Props = {
    results: InfiniteQueryResults;
    queryExecutionHandle: QueryObserverSuccessResult<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >;
    projectUuid: string;
    message: AiAgentMessageAssistant;
};

const activeTabsSchema = z.enum(['chart', 'calculation']);
const activeTabsDataSchema = z.array(
    z.object({
        label: z.string(),
        value: activeTabsSchema,
    }),
);

const activeTabsData = activeTabsDataSchema.parse([
    { label: 'Chart', value: 'chart' },
    { label: "How it's calculated", value: 'calculation' },
]);

export const AiChartVisualization: FC<Props> = ({
    results,
    queryExecutionHandle,
    projectUuid,
    message,
}) => {
    const { track } = useTracking();
    const { user } = useApp();
    const { agentUuid } = useParams();
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { metricQuery, fields } = queryExecutionHandle.data.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartSeriesClickEvent | null>(null);
    const [echartSeries, setEchartSeries] = useState<EChartSeries[]>([]);
    const [activeTab, setActiveTab] = useState<'chart' | 'calculation'>(
        'chart',
    );

    const toolCalls = message.toolCalls;

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
        }),
        [results, metricQuery, fields],
    );

    const chartConfig = useMemo(
        () =>
            getChartConfigFromAiAgentVizConfig({
                config: message.vizConfigOutput as any,
                rows: results.rows,
                type: queryExecutionHandle.data.type,
                metricQuery,
            }),
        [
            message.vizConfigOutput,
            results.rows,
            queryExecutionHandle.data.type,
            metricQuery,
        ],
    );

    const onActiveTabChange = (value: string) => {
        setActiveTab(activeTabsSchema.parse(value));

        if (
            value === 'calculation' &&
            user?.data?.userUuid &&
            user?.data?.organizationUuid &&
            agentUuid &&
            message.threadUuid &&
            message.uuid
        ) {
            track({
                name: EventName.AI_AGENT_CHART_HOW_ITS_CALCULATED_CLICKED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: agentUuid,
                    threadId: message.threadUuid,
                    messageId: message.uuid,
                    chartType: chartConfig.type,
                },
            });
        }
    };

    return (
        <MetricQueryDataProvider
            metricQuery={metricQuery}
            tableName={tableName}
            explore={explore}
            queryUuid={queryExecutionHandle.data.query.queryUuid}
        >
            <VisualizationProvider
                resultsData={resultsData}
                chartConfig={chartConfig}
                columnOrder={[
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ]}
                pivotTableMaxColumnLimit={
                    health?.pivotTable.maxColumnLimit ?? 60
                }
                initialPivotDimensions={
                    // TODO :: fix this using schema
                    message.vizConfigOutput &&
                    'breakdownByDimension' in message.vizConfigOutput
                        ? // TODO :: fix this using schema
                          [
                              message.vizConfigOutput
                                  .breakdownByDimension as string,
                          ]
                        : undefined
                }
                colorPalette={
                    organization?.chartColors ?? ECHARTS_DEFAULT_COLORS
                }
                isLoading={resultsData.isFetchingRows}
                onSeriesContextMenu={(
                    e: EchartSeriesClickEvent,
                    series: EChartSeries[],
                ) => {
                    setEchartsClickEvent(e);
                    setEchartSeries(series);
                }}
            >
                <Stack gap="md" h="100%" mih={400}>
                    <Group justify="space-between" align="start">
                        <SegmentedControl
                            style={{
                                visibility:
                                    toolCalls.length > 0 ? 'visible' : 'hidden',
                            }}
                            value={activeTab}
                            onChange={onActiveTabChange}
                            data={activeTabsData}
                            size="xs"
                            radius="md"
                            color="gray"
                        />

                        {activeTab === 'chart' && (
                            <AiChartQuickOptions
                                projectUuid={projectUuid}
                                saveChartOptions={{
                                    name: queryExecutionHandle.data.metadata
                                        .title,
                                    description:
                                        queryExecutionHandle.data.metadata
                                            .description,
                                }}
                                message={{
                                    threadUuid: message.threadUuid,
                                    uuid: message.uuid,
                                }}
                            />
                        )}
                    </Group>

                    <Box flex="1 0 0">
                        {activeTab === 'chart' ? (
                            <>
                                <LightdashVisualization
                                    className="sentry-block ph-no-capture"
                                    data-testid="ai-visualization"
                                />

                                {chartConfig.type === ChartType.CARTESIAN && (
                                    <SeriesContextMenu
                                        echartSeriesClickEvent={
                                            echartsClickEvent ?? undefined
                                        }
                                        dimensions={metricQuery.dimensions}
                                        series={echartSeries}
                                        explore={explore}
                                    />
                                )}
                                <UnderlyingDataModal />
                                <DrillDownModal />
                            </>
                        ) : activeTab === 'calculation' ? (
                            <AiChartToolCalls toolCalls={toolCalls} />
                        ) : (
                            assertUnreachable(activeTab, 'Invalid active tab')
                        )}
                    </Box>

                    {activeTab === 'chart' && (
                        <Stack gap="xs">
                            <ErrorBoundary>
                                {queryExecutionHandle.data &&
                                    queryExecutionHandle.data.type !==
                                        AiChartType.CSV && (
                                        <AgentVisualizationMetricsAndDimensions
                                            metricQuery={
                                                queryExecutionHandle.data.query
                                                    .metricQuery
                                            }
                                            fieldsMap={
                                                queryExecutionHandle.data.query
                                                    .fields
                                            }
                                        />
                                    )}

                                {message.filtersOutput && (
                                    <AgentVisualizationFilters
                                        // TODO: fix this using schema
                                        filters={message.filtersOutput}
                                    />
                                )}
                            </ErrorBoundary>
                        </Stack>
                    )}
                </Stack>
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};
