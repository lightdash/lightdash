import {
    AiChartType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type AiAgentMessageAssistant,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
} from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack } from '@mantine-8/core';
import { type QueryObserverSuccessResult } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
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
import { getChartConfigFromAiAgentVizConfig } from '../../utils/echarts';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';
import { AiChartToolCalls } from './AiChartToolCalls';

type Props = ApiAiAgentThreadMessageVizQuery & {
    results: InfiniteQueryResults;
    queryExecutionHandle: QueryObserverSuccessResult<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >;
    message: AiAgentMessageAssistant;
};

export const AiChartVisualization: FC<Props> = ({
    query,
    results,
    type,
    message,
    queryExecutionHandle,
}) => {
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { metricQuery, fields } = query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartSeriesClickEvent | null>(null);
    const [echartSeries, setEchartSeries] = useState<EChartSeries[]>([]);
    const [activeTab, setActiveTab] = useState('chart');

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
                type,
                metricQuery,
            }),
        [message.vizConfigOutput, results.rows, type, metricQuery],
    );

    return (
        <Stack gap="xs">
            <Group justify="end">
                <SegmentedControl
                    value={activeTab}
                    onChange={setActiveTab}
                    data={[
                        { label: 'Chart', value: 'chart' },
                        { label: 'How it is calculated', value: 'calculation' },
                    ]}
                    size="xs"
                    radius="md"
                    color="gray"
                />
            </Group>

            {activeTab === 'chart' ? (
                <>
                    <Box h="100%" mih={350}>
                        <MetricQueryDataProvider
                            metricQuery={metricQuery}
                            tableName={tableName}
                            explore={explore}
                            queryUuid={query.queryUuid}
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
                                    'breakdownByDimension' in
                                        message.vizConfigOutput
                                        ? // TODO :: fix this using schema
                                          [
                                              message.vizConfigOutput
                                                  .breakdownByDimension as string,
                                          ]
                                        : undefined
                                }
                                colorPalette={
                                    organization?.chartColors ??
                                    ECHARTS_DEFAULT_COLORS
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
                            </VisualizationProvider>
                            <UnderlyingDataModal />
                            <DrillDownModal />
                        </MetricQueryDataProvider>
                    </Box>
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
                </>
            ) : (
                <Box mih={350}>
                    <AiChartToolCalls toolCalls={toolCalls} />
                </Box>
            )}
        </Stack>
    );
};
