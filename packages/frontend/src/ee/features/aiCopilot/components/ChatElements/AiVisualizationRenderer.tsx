import {
    AiResultType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiAgentChartTypeOption,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
    type ChartConfig,
    type EChartsSeries,
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    Box,
    Center,
    Group,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type QueryObserverSuccessResult } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';
import { type EchartsSeriesClickEvent } from '../../../../../components/SimpleChart';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import useHealth from '../../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../../hooks/organization/useOrganization';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';

type Props = {
    results: InfiniteQueryResults;
    queryExecutionHandle: QueryObserverSuccessResult<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >;
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    headerContent?: ReactNode;

    onDashboardChartTypeChange?: (type: AiAgentChartTypeOption) => void;
    onDashboardChartConfigChange?: (config: ChartConfig) => void;
};

export const AiVisualizationRenderer: FC<Props> = ({
    results,
    queryExecutionHandle,
    chartConfig,
    headerContent,
    onDashboardChartTypeChange: onDashboardChartTypeChangeProp,
    onDashboardChartConfigChange: onDashboardChartConfigChangeProp,
}) => {
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { colorScheme } = useMantineColorScheme();

    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && organization?.chartDarkColors) {
            return organization.chartDarkColors;
        }
        return organization?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, organization?.chartColors, organization?.chartDarkColors]);

    const { metricQuery, fields } = queryExecutionHandle.data.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsSeriesClickEvent | null>(null);
    const [echartsSeries, setEchartsSeries] = useState<EChartsSeries[]>([]);

    // Initialize from cached data if available
    const [selectedChartType, setSelectedChartType] =
        useState<AiAgentChartTypeOption | null>(null);

    // Track the expanded chart config -> used to let the VisualizationProvider re-render with the new chart config, e.g. calculation of series & color assignment
    const [expandedChartConfig, setExpandedChartConfig] = useState<
        ChartConfig | undefined
    >(undefined);

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
        }),
        [results, metricQuery, fields],
    );

    const chartConfigFromAiAgentVizConfig = useMemo(
        () =>
            getWebAiChartConfig({
                vizConfig: chartConfig,
                metricQuery,
                maxQueryLimit: health?.query.maxLimit,
                fieldsMap: fields,
                overrideChartType: selectedChartType ?? undefined,
            }),
        [
            chartConfig,
            metricQuery,
            health?.query.maxLimit,
            fields,
            selectedChartType,
        ],
    );

    const groupByDimensions: string[] | undefined = useMemo(
        () => getGroupByDimensions(chartConfigFromAiAgentVizConfig),
        [chartConfigFromAiAgentVizConfig],
    );

    const displayMetricsAndDimensions = useMemo(
        () =>
            queryExecutionHandle.data &&
            queryExecutionHandle.data.type !== AiResultType.TABLE_RESULT &&
            queryExecutionHandle.data.type !== AiResultType.QUERY_RESULT,
        [queryExecutionHandle.data],
    );

    const defaultChartType =
        chartConfigFromAiAgentVizConfig.type === AiResultType.QUERY_RESULT
            ? chartConfigFromAiAgentVizConfig.vizTool.chartConfig
                  ?.defaultVizType ?? 'table'
            : 'table';

    const handleChartConfigChange = useCallback(
        (newConfig: ChartConfig) => {
            setExpandedChartConfig(newConfig);
            onDashboardChartConfigChangeProp?.(newConfig);
        },
        [onDashboardChartConfigChangeProp],
    );

    const handleChartTypeChange = useCallback(
        (type: AiAgentChartTypeOption) => {
            setSelectedChartType(type);

            // Reset expanded chart config to allow re-expansion
            setExpandedChartConfig(undefined);

            onDashboardChartTypeChangeProp?.(type);
        },
        [onDashboardChartTypeChangeProp],
    );

    if (!chartConfigFromAiAgentVizConfig.echartsConfig) {
        return (
            <Center h={300}>
                <Stack gap="xs" align="center">
                    <MantineIcon icon={IconExclamationCircle} color="gray" />
                    <Text size="sm" c="dimmed" ta="center">
                        Unable to render visualization - no chart config
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <MetricQueryDataProvider
            metricQuery={metricQuery}
            tableName={tableName}
            explore={explore}
            queryUuid={queryExecutionHandle.data.query.queryUuid}
        >
            <VisualizationProvider
                key={selectedChartType ?? 'default'}
                resultsData={resultsData}
                chartConfig={
                    expandedChartConfig ??
                    chartConfigFromAiAgentVizConfig.echartsConfig
                }
                parameters={
                    queryExecutionHandle.data.query.usedParametersValues
                }
                columnOrder={[
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                    ...metricQuery.tableCalculations.map((tc) => tc.name),
                ]}
                pivotTableMaxColumnLimit={
                    health?.pivotTable.maxColumnLimit ?? 60
                }
                initialPivotDimensions={groupByDimensions}
                colorPalette={colorPalette}
                isLoading={resultsData.isFetchingRows}
                onSeriesContextMenu={(
                    e: EchartsSeriesClickEvent,
                    series: EChartsSeries[],
                ) => {
                    setEchartsClickEvent(e);
                    setEchartsSeries(series);
                }}
                onChartConfigChange={handleChartConfigChange}
                unsavedMetricQuery={metricQuery}
            >
                <Stack gap="md" h="100%">
                    {headerContent && headerContent}
                    {chartConfigFromAiAgentVizConfig.type ===
                        AiResultType.QUERY_RESULT && (
                        <Group justify="flex-end">
                            <AgentVisualizationChartTypeSwitcher
                                metricQuery={metricQuery}
                                selectedChartType={
                                    selectedChartType ?? defaultChartType
                                }
                                hasGroupByDimensions={
                                    (groupByDimensions?.length ?? 0) > 0
                                }
                                onChartTypeChange={handleChartTypeChange}
                            />
                        </Group>
                    )}
                    <Box
                        flex="1"
                        style={{
                            // Scrolling for tables
                            overflow: 'auto',
                        }}
                    >
                        <LightdashVisualization
                            className="sentry-block ph-no-capture"
                            data-testid="ai-visualization"
                        />

                        {chartConfigFromAiAgentVizConfig.echartsConfig.type ===
                            ChartType.CARTESIAN && (
                            <SeriesContextMenu
                                echartsSeriesClickEvent={
                                    echartsClickEvent ?? undefined
                                }
                                dimensions={metricQuery.dimensions}
                                series={echartsSeries}
                                explore={explore}
                            />
                        )}
                        <UnderlyingDataModal />
                        <DrillDownModal />
                    </Box>

                    <Stack gap="xs">
                        <ErrorBoundary>
                            {displayMetricsAndDimensions && (
                                <AgentVisualizationMetricsAndDimensions
                                    metricQuery={
                                        queryExecutionHandle.data.query
                                            .metricQuery
                                    }
                                    fieldsMap={
                                        queryExecutionHandle.data.query.fields
                                    }
                                />
                            )}

                            {chartConfig.filters ? (
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
