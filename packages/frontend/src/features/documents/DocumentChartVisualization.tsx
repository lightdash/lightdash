import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    isWarehouseResourceLimitError,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { type UseQueryResult } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import LightdashVisualization from '../../components/LightdashVisualization';
import VisualizationProvider from '../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../components/MetricQueryData/MetricQueryDataProvider';
import { useProjectColorPalette } from '../../hooks/appearance/useProjectColorPalette';
import { useInfiniteQueryResults } from '../../hooks/useQueryResults';
import { useResizeObserver } from '../../hooks/useResizeObserver';
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
};

const DocumentChartVisualization = ({
    projectUuid,
    spaceUuid,
    chart,
    query,
    actions,
    showTitle = false,
}: Props) => {
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
                description={chart.description}
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
    if (chart.chartConfig.type === ChartType.DATA_APP_VIZ) {
        return (
            <ReportChartFrame
                ariaLabel={chart.name}
                title={showTitle ? chart.name : undefined}
                description={chart.description}
            >
                <Text c="dimmed">
                    This chart type is not supported in documents.
                </Text>
            </ReportChartFrame>
        );
    }
    const isLoading = query.isFetching || results.isFetchingRows || !query.data;
    return (
        <ReportChartFrame
            ariaLabel={chart.name}
            title={showTitle ? chart.name : undefined}
            description={chart.description}
            actions={actions}
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
                        chartConfig={chart.chartConfig}
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
                        <Box h="100%" ref={measureRef}>
                            <LightdashVisualization enableContextMenu={false} />
                        </Box>
                    </VisualizationProvider>
                </MetricQueryDataProvider>
            )}
        </ReportChartFrame>
    );
};

export default DocumentChartVisualization;
