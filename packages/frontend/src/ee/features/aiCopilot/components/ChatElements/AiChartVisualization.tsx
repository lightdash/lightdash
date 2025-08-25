import {
    AiResultType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type AiAgentMessageAssistant,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Title } from '@mantine-8/core';
import { IconX } from '@tabler/icons-react';
import { type QueryObserverSuccessResult } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
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
import { useAiAgentPageLayout } from '../../providers/AiLayoutProvider';
import { getChartConfigFromAiAgentVizConfig } from '../../utils/echarts';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';
import { AiChartQuickOptions } from './AiChartQuickOptions';

type Props = {
    results: InfiniteQueryResults;
    queryExecutionHandle: QueryObserverSuccessResult<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >;
    projectUuid: string;
    message: AiAgentMessageAssistant;
};

export const AiChartVisualization: FC<Props> = ({
    results,
    queryExecutionHandle,
    projectUuid,
    message,
}) => {
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { metricQuery, fields } = queryExecutionHandle.data.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartSeriesClickEvent | null>(null);
    const [echartSeries, setEchartSeries] = useState<EChartSeries[]>([]);
    const layoutContext = useAiAgentPageLayout();

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
        }),
        [results, metricQuery, fields],
    );

    const chartConfig = useMemo(() => {
        return getChartConfigFromAiAgentVizConfig({
            vizConfigOutput: message.vizConfigOutput,
            metricQuery,
            rows: results.rows,
            maxQueryLimit: health?.query.maxLimit,
        });
    }, [
        message.vizConfigOutput,
        metricQuery,
        results.rows,
        health?.query.maxLimit,
    ]);

    if (!chartConfig) return null;

    return (
        <MetricQueryDataProvider
            metricQuery={metricQuery}
            tableName={tableName}
            explore={explore}
            queryUuid={queryExecutionHandle.data.query.queryUuid}
        >
            <VisualizationProvider
                resultsData={resultsData}
                chartConfig={chartConfig.echartsConfig}
                parameters={
                    queryExecutionHandle.data.query.usedParametersValues
                }
                columnOrder={[
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                ]}
                pivotTableMaxColumnLimit={
                    health?.pivotTable.maxColumnLimit ?? 60
                }
                initialPivotDimensions={
                    (chartConfig.type === AiResultType.VERTICAL_BAR_RESULT ||
                        chartConfig.type === AiResultType.TIME_SERIES_RESULT) &&
                    chartConfig.echartsConfig.type === ChartType.CARTESIAN &&
                    chartConfig.vizTool.vizConfig.breakdownByDimension
                        ? [
                              chartConfig.vizTool.vizConfig
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
                <Stack gap="md" h="100%">
                    {layoutContext ? (
                        // If we are rendering viz in artifacts, update header to hve title, description, etc
                        <Group gap="md" align="start">
                            <Stack gap={0} flex={1}>
                                <Title order={5}>
                                    {queryExecutionHandle.data.metadata.title}
                                </Title>
                                <Text c="dimmed" size="xs">
                                    {
                                        queryExecutionHandle.data.metadata
                                            .description
                                    }
                                </Text>
                            </Stack>
                            <Group gap="sm">
                                <AiChartQuickOptions
                                    message={message}
                                    projectUuid={projectUuid}
                                    saveChartOptions={{
                                        name: queryExecutionHandle.data.metadata
                                            .title,
                                        description:
                                            queryExecutionHandle.data.metadata
                                                .description,
                                    }}
                                />
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="gray"
                                    onClick={layoutContext.clearArtifact}
                                >
                                    <MantineIcon icon={IconX} color="gray" />
                                </ActionIcon>
                            </Group>
                        </Group>
                    ) : (
                        // If not artifact panel available, we render viz inline so skip headers
                        <Group justify="flex-end" align="start">
                            <AiChartQuickOptions
                                message={message}
                                projectUuid={projectUuid}
                                saveChartOptions={{
                                    name: queryExecutionHandle.data.metadata
                                        .title,
                                    description:
                                        queryExecutionHandle.data.metadata
                                            .description,
                                }}
                            />
                        </Group>
                    )}

                    <Box
                        flex="1 0 0"
                        style={{
                            // Scrolling for tables
                            overflow: 'auto',
                        }}
                    >
                        <LightdashVisualization
                            className="sentry-block ph-no-capture"
                            data-testid="ai-visualization"
                        />

                        {chartConfig.echartsConfig.type ===
                            ChartType.CARTESIAN && (
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
                    </Box>

                    <Stack gap="xs">
                        <ErrorBoundary>
                            {queryExecutionHandle.data &&
                                queryExecutionHandle.data.type !==
                                    AiResultType.TABLE_RESULT && (
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

                            {message.vizConfigOutput &&
                            'filters' in message.vizConfigOutput &&
                            message.vizConfigOutput.filters ? (
                                <AgentVisualizationFilters
                                    filters={
                                        queryExecutionHandle.data.query
                                            .metricQuery.filters
                                    }
                                    fieldsMap={
                                        queryExecutionHandle.data.query.fields
                                    }
                                />
                            ) : null}
                        </ErrorBoundary>
                    </Stack>
                </Stack>
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};
