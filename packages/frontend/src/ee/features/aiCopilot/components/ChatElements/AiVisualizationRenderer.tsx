import {
    AiResultType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiAgentChartTypeOption,
    type ApiAiAgentThreadMessageVizQuery,
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
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';
import { type EchartsSeriesClickEvent } from '../../../../../components/SimpleChart';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import useHealth from '../../../../../hooks/health/useHealth';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import AgentVisualizationFilters from './AgentVisualizationFilters';
import AgentVisualizationMetricsAndDimensions from './AgentVisualizationMetricsAndDimensions';

type Props = {
    vizQueryData: ApiAiAgentThreadMessageVizQuery;
    results: InfiniteQueryResults;
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    selectedChartType: AiAgentChartTypeOption | null;
    // When provided, an inline switcher is rendered above the chart. Omit
    // it (e.g. on the floating panel) when a parent renders its own.
    onChartTypeChange?: (type: AiAgentChartTypeOption) => void;
    // Forwarded when the underlying viz expands its config — used by the
    // dashboard path to sync the change back into the query cache.
    onExpandedChartConfigChange?: (config: ChartConfig) => void;
    headerContent?: ReactNode;
};

export const AiVisualizationRenderer: FC<Props> = ({
    vizQueryData,
    results,
    chartConfig,
    selectedChartType,
    onChartTypeChange,
    onExpandedChartConfigChange,
    headerContent,
}) => {
    const { data: health } = useHealth();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: resolvedPalette } = useProjectColorPalette(projectUuid);
    const { colorScheme } = useMantineColorScheme();

    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && resolvedPalette?.darkColors) {
            return resolvedPalette.darkColors;
        }
        return resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, resolvedPalette]);

    const { metricQuery, fields, resolvedTimezone } = vizQueryData.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsSeriesClickEvent | null>(null);
    const [echartsSeries, setEchartsSeries] = useState<EChartsSeries[]>([]);

    const [expandedChartConfig, setExpandedChartConfig] = useState<
        ChartConfig | undefined
    >(undefined);

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
            resolvedTimezone: resolvedTimezone ?? undefined,
        }),
        [results, metricQuery, fields, resolvedTimezone],
    );

    const webAiChartConfig = useMemo(
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
        () => getGroupByDimensions(webAiChartConfig),
        [webAiChartConfig],
    );

    const displayMetricsAndDimensions =
        vizQueryData.type !== AiResultType.TABLE_RESULT &&
        vizQueryData.type !== AiResultType.QUERY_RESULT;

    const defaultChartType: AiAgentChartTypeOption =
        webAiChartConfig.type === AiResultType.QUERY_RESULT
            ? (webAiChartConfig.vizTool.chartConfig?.defaultVizType ?? 'table')
            : 'table';

    const handleChartConfigChange = useCallback(
        (newConfig: ChartConfig) => {
            setExpandedChartConfig(newConfig);
            onExpandedChartConfigChange?.(newConfig);
        },
        [onExpandedChartConfigChange],
    );

    if (!webAiChartConfig.echartsConfig) {
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
            queryUuid={vizQueryData.query.queryUuid}
            resolvedTimezone={resolvedTimezone}
        >
            <VisualizationProvider
                key={selectedChartType ?? 'default'}
                resultsData={resultsData}
                chartConfig={
                    expandedChartConfig ?? webAiChartConfig.echartsConfig
                }
                parameters={vizQueryData.query.usedParametersValues}
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
                    {headerContent}
                    {webAiChartConfig.type === AiResultType.QUERY_RESULT &&
                        onChartTypeChange && (
                            <Group justify="flex-end">
                                <AgentVisualizationChartTypeSwitcher
                                    metricQuery={metricQuery}
                                    selectedChartType={
                                        selectedChartType ?? defaultChartType
                                    }
                                    hasGroupByDimensions={
                                        (groupByDimensions?.length ?? 0) > 0
                                    }
                                    onChartTypeChange={onChartTypeChange}
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

                        {webAiChartConfig.echartsConfig.type ===
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
                                    metricQuery={metricQuery}
                                    fieldsMap={fields}
                                />
                            )}

                            {chartConfig.filters ? (
                                <AgentVisualizationFilters
                                    filters={metricQuery.filters}
                                    fieldsMap={fields}
                                />
                            ) : null}
                        </ErrorBoundary>
                    </Stack>
                </Stack>
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};
