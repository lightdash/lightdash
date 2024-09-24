import { assertUnreachable, ChartKind } from '@lightdash/common';
import { Box, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { pick } from 'lodash';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
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

enum ViewerTabs {
    VIZ = 'viz',
    RESULTS = 'results',
}

const SemanticViewerViewPage = () => {
    const [activeViewerTab, setActiveViewerTab] = useState<ViewerTabs>(
        ViewerTabs.VIZ,
    );

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
        uuid: savedSemanticViewerChartUuid,
        config: chartQuery.data?.chart.config,
        slug: chartQuery.data?.chart.slug,
    });

    const pivotResultsRunner = useMemo(() => {
        if (!chartQuery.isSuccess) return;
        if (!fieldsQuery.isSuccess) return;
        if (!chartVizQuery.isSuccess) return;

        if (chartQuery.data.chart.config.type === ChartKind.TABLE) return;

        return new SemanticViewerResultsRunner({
            projectUuid,
            query: chartQuery.data.chart.semanticLayerQuery,
            rows: chartVizQuery.data?.results ?? [],
            columns: chartVizQuery.data?.columns ?? [],
            fields: fieldsQuery.data,
        });
    }, [
        projectUuid,
        fieldsQuery.isSuccess,
        fieldsQuery.data,
        chartQuery.isSuccess,
        chartQuery.data,
        chartVizQuery.isSuccess,
        chartVizQuery.data,
    ]);

    // TODO: add error state
    if (chartQuery.isError || fieldsQuery.isError || chartVizQuery.isError) {
        return null;
    }

    // TODO: add loading state
    if (
        chartQuery.isLoading ||
        fieldsQuery.isLoading ||
        chartVizQuery.isLoading
    ) {
        return null;
    }

    const chartType = chartQuery.data.chart.config.type;

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            withPaddedContent
            header={
                <HeaderView
                    projectUuid={projectUuid}
                    savedSemanticViewerChart={chartQuery.data.chart}
                />
            }
        >
            {chartType === ChartKind.TABLE ? null : (
                <Box mb="lg">
                    <SegmentedControl
                        styles={(theme) => ({
                            root: {
                                backgroundColor: theme.colors.gray[2],
                            },
                        })}
                        size="sm"
                        radius="md"
                        data={[
                            {
                                value: ViewerTabs.VIZ,
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <MantineIcon
                                            icon={IconChartHistogram}
                                        />
                                        <Text>Chart</Text>
                                    </Group>
                                ),
                            },
                            {
                                value: ViewerTabs.RESULTS,
                                label: (
                                    <Group spacing="xs" noWrap>
                                        <MantineIcon icon={IconTable} />
                                        <Text>Results</Text>
                                    </Group>
                                ),
                            },
                        ]}
                        disabled={
                            !chartQuery.isSuccess ||
                            !fieldsQuery.isSuccess ||
                            !chartData ||
                            !resultsRunner
                        }
                        value={activeViewerTab}
                        onChange={(value: ViewerTabs) =>
                            setActiveViewerTab(value)
                        }
                    />
                </Box>
            )}

            {activeViewerTab === ViewerTabs.VIZ ? (
                chartType === ChartKind.VERTICAL_BAR ||
                chartType === ChartKind.LINE ||
                chartType === ChartKind.PIE ? (
                    <Box h="100%" w="100%" mih="inherit" pos="relative">
                        <ChartView
                            config={chartQuery.data.chart.config}
                            spec={chartSpec}
                            isLoading={chartVizQuery.isLoading}
                            error={chartVizQuery.error}
                            style={{
                                minHeight: 'inherit',
                                height: 'inherit',
                                width: 'inherit',
                            }}
                        />
                    </Box>
                ) : chartType === ChartKind.TABLE ? (
                    resultsRunner ? (
                        <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                            {/* So that the Table tile isn't cropped by the overflow */}
                            <Table
                                resultsRunner={resultsRunner}
                                columnsConfig={
                                    chartQuery.data.chart.config.columns
                                }
                            />
                        </Box>
                    ) : null
                ) : (
                    assertUnreachable(
                        chartType,
                        `Unknown chart type ${chartType}`,
                    )
                )
            ) : activeViewerTab === ViewerTabs.RESULTS ? (
                pivotResultsRunner ? (
                    <Table
                        resultsRunner={pivotResultsRunner}
                        columnsConfig={Object.fromEntries(
                            chartVizQuery.data?.columns.map((field) => [
                                field.reference,
                                {
                                    visible: true,
                                    reference: field.reference,
                                    label: field.reference,
                                    frozen: false,
                                    // TODO: add aggregation
                                    // aggregation?: VizAggregationOptions;
                                },
                            ]) ?? [],
                        )}
                    />
                ) : null
            ) : (
                assertUnreachable(
                    activeViewerTab,
                    `Unknown tab ${activeViewerTab}`,
                )
            )}
        </Page>
    );
};

export default SemanticViewerViewPage;
