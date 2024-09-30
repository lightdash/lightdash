import { assertUnreachable, ChartKind } from '@lightdash/common';
import { Box, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { useChartViz } from '../components/DataViz/hooks/useChartViz';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
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

    const { projectUuid, savedSemanticViewerChartSlug } = useParams<{
        projectUuid: string;
        savedSemanticViewerChartSlug: string;
    }>();

    const chartQuery = useSavedSemanticViewerChart({
        projectUuid,
        findBy: { slug: savedSemanticViewerChartSlug },
    });

    const chartResultsQuery = useSavedSemanticViewerChartResults({
        projectUuid,
        findBy: { slug: savedSemanticViewerChartSlug },
    });

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            // TODO: this should never be empty or that hook should receive a null view!
            semanticLayerView: chartQuery.data?.semanticLayerView ?? '',
            semanticLayerQuery: chartQuery.data?.semanticLayerQuery,
        },
        { enabled: chartQuery.isSuccess },
    );

    const resultsRunner = useMemo(() => {
        if (
            !fieldsQuery.isSuccess ||
            !chartQuery.isSuccess ||
            !chartResultsQuery.isSuccess
        ) {
            return;
        }

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartResultsQuery.data.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.semanticLayerQuery,
            rows: chartResultsQuery.data.results,
            columns: vizColumns,
        });
    }, [
        projectUuid,
        fieldsQuery.isSuccess,
        fieldsQuery.data,
        chartQuery.isSuccess,
        chartQuery.data,
        chartResultsQuery.isSuccess,
        chartResultsQuery.data,
    ]);

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        uuid: chartQuery.data?.savedSemanticViewerChartUuid,
        config: chartQuery.data?.config,
        slug: chartQuery.data?.slug,
    });

    const pivotResultsRunner = useMemo(() => {
        if (
            !chartQuery.isSuccess ||
            !fieldsQuery.isSuccess ||
            !chartVizQuery.isSuccess
        ) {
            return;
        }

        if (chartQuery.data.config.type === ChartKind.TABLE) return;

        return new SemanticViewerResultsRunner({
            projectUuid,
            query: chartQuery.data.semanticLayerQuery,
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
    if (chartQuery.isLoading || fieldsQuery.isLoading) {
        return null;
    }

    const chartType = chartQuery.data.config.type;

    // TODO: add loading state
    if (chartType !== ChartKind.TABLE && chartVizQuery.isLoading) {
        return null;
    }

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            withPaddedContent
            header={
                <HeaderView
                    projectUuid={projectUuid}
                    savedSemanticViewerChart={chartQuery.data}
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
                            config={chartQuery.data.config}
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
                                columnsConfig={chartQuery.data.config.columns}
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
