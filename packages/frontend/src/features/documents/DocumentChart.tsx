import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    isWarehouseResourceLimitError,
    type DocumentCellV3,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import LightdashVisualization from '../../components/LightdashVisualization';
import VisualizationProvider from '../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../components/MetricQueryData/MetricQueryDataProvider';
import { useProjectColorPalette } from '../../hooks/appearance/useProjectColorPalette';
import { useInfiniteQueryResults } from '../../hooks/useQueryResults';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import ReportChartFrame from './presentation/ReportChartFrame';
import { useDocumentCellQuery } from './useDocument';

type Props = {
    projectUuid: string;
    spaceUuid: string;
    documentUuid: string;
    versionUuid: string;
    cell: Extract<DocumentCellV3, { type: 'chart' }>;
};

const DocumentChart = ({
    projectUuid,
    spaceUuid,
    documentUuid,
    versionUuid,
    cell,
}: Props) => {
    const { chart } = cell.content;
    const palette = useProjectColorPalette(projectUuid, { spaceUuid });
    const query = useDocumentCellQuery(
        projectUuid,
        documentUuid,
        versionUuid,
        cell.id,
    );
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
                description={chart.description}
            >
                <Text c="dimmed">
                    This chart type is not supported in documents.
                </Text>
            </ReportChartFrame>
        );
    }
    return (
        <ReportChartFrame
            ariaLabel={chart.name}
            description={chart.description}
        >
            {query.isFetching || results.isFetchingRows || !query.data ? (
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
                        isLoading={
                            query.isFetching ||
                            results.isFetchingRows ||
                            !query.data
                        }
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

export default DocumentChart;
