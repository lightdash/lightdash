import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type DocumentCellV1,
} from '@lightdash/common';
import { Box, Text } from '@mantine/core';
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
    cell: Extract<DocumentCellV1, { type: 'chart' }>;
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
    if (error) {
        return <Text c="red">Unable to load chart: {error.error.message}</Text>;
    }
    if (chart.chartConfig.type === ChartType.DATA_APP_VIZ) {
        return (
            <Text c="dimmed">
                This chart type is not supported in documents.
            </Text>
        );
    }
    return (
        <ReportChartFrame title={chart.name} description={chart.description}>
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
                    <Box h={400} ref={measureRef}>
                        <LightdashVisualization enableContextMenu={false} />
                    </Box>
                </VisualizationProvider>
            </MetricQueryDataProvider>
        </ReportChartFrame>
    );
};

export default DocumentChart;
