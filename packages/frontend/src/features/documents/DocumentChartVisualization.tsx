import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    getDocumentRuntimeChartConfig,
    isWarehouseResourceLimitError,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type DocumentQueryReference,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import LightdashVisualization from '../../components/LightdashVisualization';
import VisualizationProvider from '../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../components/MetricQueryData/MetricQueryDataProvider';
import { useProjectColorPalette } from '../../hooks/appearance/useProjectColorPalette';
import { useInfiniteQueryResults } from '../../hooks/useQueryResults';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { DocumentRenderTargetContext } from '../chartTypes/documentRenderTarget/context';
import ReportChartFrame from './presentation/ReportChartFrame';

type Props = {
    projectUuid: string;
    spaceUuid: string;
    chart: SemanticChartAsCode;
    query: Pick<
        UseQueryResult<ApiExecuteAsyncMetricQueryResults, ApiError>,
        'data' | 'error' | 'isFetching' | 'refetch'
    >;
    actions?: ReactNode;
    showTitle?: boolean;
    /** The saved cell being rendered; unsaved drafts have none. */
    renderTarget?: DocumentQueryReference;
};

const DocumentChartVisualization = ({
    projectUuid,
    spaceUuid,
    chart,
    query,
    actions,
    showTitle = false,
    renderTarget,
}: Props) => {
    const chartConfig = useMemo(
        () => getDocumentRuntimeChartConfig(chart.chartConfig),
        [chart.chartConfig],
    );
    const palette = useProjectColorPalette(projectUuid, { spaceUuid });
    const results = useInfiniteQueryResults(
        projectUuid,
        query.data?.queryUuid,
        chart.name,
    );
    const [measureRef, { width, height }] = useResizeObserver<HTMLDivElement>();
    const error = query.error ?? results.error;
    const isResourceLimitError = isWarehouseResourceLimitError(
        error?.error.message ?? '',
    );
    if (error) {
        return (
            <ReportChartFrame
                ariaLabel={chart.name}
                title={showTitle ? chart.name : undefined}
                description={showTitle ? undefined : chart.description}
            >
                <InlineErrorState
                    message={
                        isResourceLimitError
                            ? 'This chart exceeds the warehouse query limit.'
                            : 'The live data for this chart could not be loaded.'
                    }
                    onRetry={
                        isResourceLimitError
                            ? undefined
                            : () => {
                                  void query.refetch();
                                  if (results.error) {
                                      void results.refetchRows();
                                  }
                              }
                    }
                />
            </ReportChartFrame>
        );
    }
    const isLoading = query.isFetching || results.isFetchingRows || !query.data;
    return (
        <ReportChartFrame
            ariaLabel={chart.name}
            title={showTitle ? chart.name : undefined}
            description={showTitle ? undefined : chart.description}
            actions={actions}
            // Tables hug their rows; other charts need a fixed canvas to draw in
            fit={
                !isLoading && chart.chartConfig.type === ChartType.TABLE
                    ? 'content'
                    : 'fixed'
            }
        >
            {isLoading ? (
                <EmptyStateLoader title="Loading live chart data" />
            ) : (
                <MetricQueryDataProvider
                    tableName={chart.tableName}
                    explore={undefined}
                    metricQuery={query.data?.metricQuery}
                    queryUuid={query.data?.queryUuid}
                    parameters={query.data?.usedParametersValues}
                    resolvedTimezone={query.data?.resolvedTimezone}
                >
                    <VisualizationProvider
                        minimal
                        chartConfig={chartConfig}
                        initialPivotDimensions={chart.pivotConfig?.columns}
                        initialPivotRows={chart.pivotConfig?.rows}
                        resultsData={{
                            ...results,
                            metricQuery: query.data?.metricQuery,
                            fields: query.data?.fields,
                            resolvedTimezone:
                                query.data?.resolvedTimezone ?? undefined,
                        }}
                        isLoading={isLoading}
                        columnOrder={chart.tableConfig?.columnOrder ?? []}
                        colorPalette={
                            palette.data?.colors ?? ECHARTS_DEFAULT_COLORS
                        }
                        parameters={query.data?.usedParametersValues}
                        containerWidth={width}
                        containerHeight={height}
                    >
                        <DocumentRenderTargetContext.Provider
                            value={renderTarget}
                        >
                            <Box h="100%" ref={measureRef}>
                                <LightdashVisualization
                                    enableContextMenu={false}
                                />
                            </Box>
                        </DocumentRenderTargetContext.Provider>
                    </VisualizationProvider>
                </MetricQueryDataProvider>
            )}
        </ReportChartFrame>
    );
};

export default DocumentChartVisualization;
