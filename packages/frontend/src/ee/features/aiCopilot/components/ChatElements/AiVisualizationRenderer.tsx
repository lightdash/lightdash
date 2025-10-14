import {
    AiResultType,
    CartesianSeriesType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type ApiAiAgentThreadMessageVizQuery,
    type ApiError,
    type ChartTypeOption,
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import { Box, Center, Group, Stack, Text } from '@mantine-8/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type QueryObserverSuccessResult } from '@tanstack/react-query';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';
import { type EchartSeriesClickEvent } from '../../../../../components/SimpleChart';
import ErrorBoundary from '../../../../../features/errorBoundary/ErrorBoundary';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../../../../../hooks/cartesianChartConfig/utils';
import { type EChartSeries } from '../../../../../hooks/echarts/useEchartsCartesianConfig';
import useHealth from '../../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../../hooks/organization/useOrganization';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { getChartConfigFromAiAgentVizConfig } from '../../utils/echarts';
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
};

export const AiVisualizationRenderer: FC<Props> = ({
    results,
    queryExecutionHandle,
    chartConfig,
    headerContent,
}) => {
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { metricQuery, fields } = queryExecutionHandle.data.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartSeriesClickEvent | null>(null);
    const [echartSeries, setEchartSeries] = useState<EChartSeries[]>([]);
    const [selectedChartType, setSelectedChartType] =
        useState<ChartTypeOption | null>(null);

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
        }),
        [results, metricQuery, fields],
    );

    const {
        echartsConfig,
        type: aiResultType,
        vizTool,
    } = useMemo(() => {
        return getChartConfigFromAiAgentVizConfig({
            vizConfig: chartConfig,
            metricQuery,
            maxQueryLimit: health?.query.maxLimit,
            fieldsMap: fields,
            overrideChartType: selectedChartType ?? undefined,
        });
    }, [
        chartConfig,
        metricQuery,
        health?.query.maxLimit,
        fields,
        selectedChartType,
    ]);

    const groupByDimensions: string[] | undefined = useMemo(() => {
        switch (aiResultType) {
            case AiResultType.QUERY_RESULT:
                return vizTool.chartConfig?.groupBy ?? undefined;
            case AiResultType.VERTICAL_BAR_RESULT:
            case AiResultType.TIME_SERIES_RESULT:
                return vizTool.vizConfig.breakdownByDimension
                    ? [vizTool.vizConfig.breakdownByDimension]
                    : undefined;
        }

        return undefined;
    }, [vizTool, aiResultType]);

    const computedSeries = useMemo(() => {
        if (aiResultType !== AiResultType.QUERY_RESULT) return [];
        if (echartsConfig.type !== ChartType.CARTESIAN) return [];
        if (!echartsConfig.config?.eChartsConfig?.series?.length) return [];
        if (!echartsConfig.config?.layout?.xField) return [];
        if (!echartsConfig.config?.layout?.yField) return [];

        const firstSerie = echartsConfig.config?.eChartsConfig?.series?.[0];

        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: firstSerie?.smooth,
            defaultShowSymbol: firstSerie?.showSymbol,
            defaultAreaStyle: firstSerie?.areaStyle,
            defaultCartesianType: CartesianSeriesType.BAR,
            availableDimensions: metricQuery.dimensions,
            isStacked: false,
            pivotKeys: groupByDimensions,
            resultsData: resultsData,
            xField: echartsConfig.config.layout.xField,
            yFields: echartsConfig.config.layout.yField,
            defaultLabel: firstSerie?.label,
            itemsMap: fields,
        });
        const newSeries = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: echartsConfig.config?.eChartsConfig?.series || [],
        });
        return newSeries;
    }, [
        echartsConfig,
        metricQuery,
        fields,
        groupByDimensions,
        resultsData,
        aiResultType,
    ]);

    const displayMetricsAndDimensions = useMemo(
        () =>
            queryExecutionHandle.data &&
            queryExecutionHandle.data.type !== AiResultType.TABLE_RESULT &&
            queryExecutionHandle.data.type !== AiResultType.QUERY_RESULT,
        [queryExecutionHandle.data],
    );

    const defaultChartType =
        chartConfig.type === AiResultType.QUERY_RESULT
            ? chartConfig.chartConfig?.defaultVizType ?? 'table'
            : 'table';

    if (!echartsConfig) {
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
                chartConfig={echartsConfig}
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
                computedSeries={computedSeries}
            >
                <Stack gap="md" h="100%">
                    {headerContent && headerContent}
                    {aiResultType === AiResultType.QUERY_RESULT && (
                        <Group justify="flex-end">
                            <AgentVisualizationChartTypeSwitcher
                                metricQuery={metricQuery}
                                selectedChartType={
                                    selectedChartType ?? defaultChartType
                                }
                                hasGroupByDimensions={
                                    (groupByDimensions?.length ?? 0) > 0
                                }
                                onChartTypeChange={setSelectedChartType}
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

                        {echartsConfig.type === ChartType.CARTESIAN && (
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
