import { ChartKind, isVizTableConfig } from '@lightdash/common';
import { Box } from '@mantine/core';
import { pick } from 'lodash';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { useChartViz } from '../components/DataViz/hooks/useChartViz';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import {
    useSavedSemanticViewerChart,
    useSemanticLayerViewFields,
} from '../features/semanticViewer/api/hooks';
import { HeaderView } from '../features/semanticViewer/components/Header/HeaderView';
import { SemanticViewerResultsRunner } from '../features/semanticViewer/runners/SemanticViewerResultsRunner';

const SemanticViewerViewPage = () => {
    const { projectUuid, savedSemanticViewerChartUuid } = useParams<{
        projectUuid: string;
        savedSemanticViewerChartUuid: string;
    }>();

    const chartQuery = useSavedSemanticViewerChart({
        projectUuid,
        uuid: savedSemanticViewerChartUuid,
    });

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            view: chartQuery.isSuccess
                ? chartQuery.data.chart.semanticLayerView ?? ''
                : '', // TODO: this should never be empty or that hook should receive a null view!
            selectedFields: chartQuery.isSuccess
                ? pick(chartQuery.data.chart.semanticLayerQuery, [
                      'dimensions',
                      'timeDimensions',
                      'metrics',
                  ])
                : { dimensions: [], timeDimensions: [], metrics: [] },
        },
        { enabled: chartQuery.isSuccess },
    );

    const chartData = useMemo(() => {
        if (!chartQuery.isSuccess) return undefined;

        return {
            results: chartQuery.data.resultsAndColumns.results,
            columns: chartQuery.data.resultsAndColumns.columns,
        };
    }, [chartQuery]);

    const resultsRunner = useMemo(() => {
        if (!chartQuery.isSuccess || !fieldsQuery.isSuccess || !chartData)
            return;

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartData.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.chart.semanticLayerQuery,
            rows: chartData.results,
            columns: vizColumns,
        });
    }, [chartQuery, fieldsQuery, chartData, projectUuid]);

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        uuid: savedSemanticViewerChartUuid ?? undefined,
        config: chartQuery.data?.chart.config,
        slug: chartQuery.data?.chart.slug,
    });

    if (chartQuery.isError) return null;
    if (!chartQuery.isSuccess) return null;

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            noContentPadding
            header={
                <HeaderView
                    projectUuid={projectUuid}
                    savedSemanticViewerChart={chartQuery.data.chart}
                />
            }
        >
            {resultsRunner &&
                chartQuery.data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(chartQuery.data.chart.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={chartQuery.data.chart.config.columns}
                        />
                    </Box>
                )}

            {savedSemanticViewerChartUuid &&
                (chartQuery.data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    chartQuery.data.chart.config.type === ChartKind.LINE ||
                    chartQuery.data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={chartQuery.data.chart.config}
                        spec={chartSpec}
                        isLoading={chartVizQuery.isLoading}
                        error={chartVizQuery.error}
                        style={{
                            minHeight: 'inherit',
                            height: '100%',
                            width: '100%',
                        }}
                    />
                )}
        </Page>
    );
};

export default SemanticViewerViewPage;
