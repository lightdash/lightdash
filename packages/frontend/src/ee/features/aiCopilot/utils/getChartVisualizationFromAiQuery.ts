import type { ApiAiAgentThreadMessageViz, XAxis } from '@lightdash/common';
import {
    AiChartType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type ChartConfig,
    type CreateSavedChartVersion,
    type MetricQuery,
} from '@lightdash/common';
import { type Axis } from 'echarts';
import { type VisualizationProviderProps } from '../../../../components/LightdashVisualization/VisualizationProvider';
import { type EChartSeries } from '../../../../hooks/echarts/useEchartsCartesianConfig';
import type useHealth from '../../../../hooks/health/useHealth';
import { type useOrganization } from '../../../../hooks/organization/useOrganization';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';
import { defaultState } from '../../../../providers/Explorer/defaultState';

export const getChartVisualizationFromAiQuery = (
    data: ApiAiAgentThreadMessageViz,
    health: ReturnType<typeof useHealth>['data'],
    org: ReturnType<typeof useOrganization>['data'],
    activeProjectUuid?: string,
): VisualizationProviderProps & {
    openInExploreUrl: { pathname: string; search: string } | null;
} => {
    const metricQuery: MetricQuery = {
        ...defaultState.unsavedChartVersion.metricQuery,
        ...data.metricQuery,
    };

    const getChartConfig = (): ChartConfig => {
        // Convert AI chart type to Lightdash chart type
        let chartType: ChartType;
        switch (data.type) {
            case AiChartType.VERTICAL_BAR_CHART:
            case AiChartType.TIME_SERIES_CHART:
                chartType = ChartType.CARTESIAN;
                break;
            case AiChartType.CSV:
                chartType = ChartType.TABLE;
                break;
            default:
                return assertUnreachable(
                    data.type,
                    `Invalid chart type ${data.type}`,
                );
        }

        if (
            chartType === ChartType.CARTESIAN &&
            data.chartOptions &&
            !!metricQuery
        ) {
            // Extract configuration from AI data and convert to Lightdash format
            const echartsConfig = data.chartOptions;

            // Create proper Lightdash Series objects
            const lightdashSeries =
                ('series' in echartsConfig &&
                echartsConfig.series &&
                Array.isArray(echartsConfig.series)
                    ? echartsConfig.series
                    : []
                )?.map((echartSeries: EChartSeries) => {
                    const yField =
                        echartSeries.encode?.y || metricQuery.metrics[0];
                    const xField =
                        echartSeries.encode?.x || metricQuery.dimensions[0];

                    return {
                        type:
                            echartSeries.type === CartesianSeriesType.BAR
                                ? CartesianSeriesType.BAR
                                : echartSeries.type,
                        name: echartSeries.name || yField,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: xField },
                            yRef: { field: yField },
                        },
                    };
                }) || [];

            // Create a basic layout from the metric query
            const layout = {
                xField: metricQuery.dimensions[0],
                yField: metricQuery.metrics,
            };

            return {
                type: ChartType.CARTESIAN,
                config: {
                    layout,
                    eChartsConfig: {
                        series: lightdashSeries,
                        xAxis:
                            'xAxis' in echartsConfig
                                ? (echartsConfig.xAxis as XAxis[])
                                : undefined,
                        yAxis:
                            'yAxis' in echartsConfig
                                ? (echartsConfig.yAxis as Axis[])
                                : undefined,
                        legend: {
                            show: true,
                            type: 'plain',
                        },
                        grid: { containLabel: true },
                    },
                },
            };
        }

        return {
            type: ChartType.TABLE,
            config: {},
        };
    };

    const getResultsData = () => {
        return {
            rows: data.results.rows,
            metricQuery,
            fields: data.results.fields,
            cacheMetadata: data.results.cacheMetadata,

            // Add required properties for InfiniteQueryResults
            isInitialLoading: false,
            isFetchingFirstPage: false,
            isFetchingRows: false,
            isFetchingAllPages: false,
            error: null,
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchMoreRows: () => {}, // No-op function for AI results
            setFetchAll: () => {}, // No-op function for AI results
            fetchAll: false,
            hasFetchedAllRows: true, // AI results come complete
            totalClientFetchTimeMs: 0,
            projectUuid: activeProjectUuid,
            queryStatus: undefined,
            totalResults: data.results.rows?.length || 0,
            initialQueryExecutionMs: undefined,
            queryUuid: undefined,
        };
    };

    const columnOrder = [...metricQuery.dimensions, ...metricQuery.metrics];

    const getOpenInExploreUrl = () => {
        const resultsData = getResultsData();
        if (!metricQuery || !activeProjectUuid || !resultsData) return null;

        const createSavedChart: CreateSavedChartVersion = {
            tableName: metricQuery.exploreName,
            metricQuery,
            chartConfig: getChartConfig(),
            tableConfig: {
                columnOrder,
            },
            // TODO: Add pivotConfig
            pivotConfig: undefined,
            updatedByUser: undefined,
        };

        const url = getExplorerUrlFromCreateSavedChartVersion(
            activeProjectUuid,
            createSavedChart,
        );

        return url;
    };

    const props = {
        chartConfig: getChartConfig(),
        resultsData: getResultsData(),
        columnOrder,
        openInExploreUrl: getOpenInExploreUrl(),
        pivotTableMaxColumnLimit: health?.pivotTable.maxColumnLimit ?? 60,
        colorPalette: org?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        initialPivotDimensions: undefined,
        isLoading: false,
        onChartTypeChange: undefined,
        onChartConfigChange: undefined,
        onPivotDimensionsChange: undefined,
        itemsMap: data.results.fields,
    };

    return props;
};
