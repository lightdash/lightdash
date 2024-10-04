import {
    assertUnreachable,
    ChartKind,
    isVizTableConfig,
} from '@lightdash/common';
import { Box, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import getChartDataModel from '../components/DataViz/transformers/getChartDataModel';
import { ChartDataTable } from '../components/DataViz/visualizations/ChartDataTable';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
    useSemanticLayerViewFields,
} from '../features/semanticViewer/api/hooks';
import { HeaderView } from '../features/semanticViewer/components/Header/HeaderView';
import { SemanticViewerResultsRunnerFrontend } from '../features/semanticViewer/runners/SemanticViewerResultsRunnerFrontend';

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

    const savedSemanticLayerQuery = useMemo(() => {
        return chartQuery.data?.semanticLayerQuery;
    }, [chartQuery.data?.semanticLayerQuery]);

    const resultsRunner = useMemo(() => {
        if (
            !fieldsQuery.isSuccess ||
            !chartQuery.isSuccess ||
            !chartResultsQuery.isSuccess
        ) {
            return;
        }

        return new SemanticViewerResultsRunnerFrontend({
            projectUuid,
            fields: fieldsQuery.data,
            rows: chartResultsQuery.data.results,
            columnNames: chartResultsQuery.data.columns,
        });
    }, [
        projectUuid,
        fieldsQuery.isSuccess,
        fieldsQuery.data,
        chartQuery.isSuccess,
        chartResultsQuery.isSuccess,
        chartResultsQuery.data,
    ]);

    const chartFieldConfig = useMemo(() => {
        return isVizTableConfig(chartQuery.data?.config)
            ? chartQuery.data?.config.columns
            : chartQuery.data?.config.fieldConfig;
    }, [chartQuery.data]);

    const vizDataModel = useMemo(() => {
        if (!resultsRunner) return;
        return getChartDataModel(
            resultsRunner,
            chartFieldConfig,
            chartQuery.data?.config.type ?? ChartKind.TABLE,
        );
    }, [resultsRunner, chartFieldConfig, chartQuery.data?.config.type]);

    const { loading: chartLoading, error: chartError } = useAsync(
        async () =>
            vizDataModel?.getPivotedChartData({
                sortBy: savedSemanticLayerQuery?.sortBy ?? [],
                filters: savedSemanticLayerQuery?.filters ?? [],
                limit: savedSemanticLayerQuery?.limit ?? undefined,
                sql: savedSemanticLayerQuery?.sql ?? undefined,
            }),
        [vizDataModel, savedSemanticLayerQuery],
    );

    const { spec, tableData } = useMemo(
        () => ({
            spec: vizDataModel?.getSpec(chartQuery.data?.config.display),
            tableData: vizDataModel?.getPivotedTableData(),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [vizDataModel, chartQuery.data?.config.display, chartLoading],
    );

    // TODO: add error state
    if (
        !vizDataModel ||
        chartQuery.isError ||
        fieldsQuery.isError ||
        chartError
    ) {
        return null;
    }

    // TODO: add loading state
    if (chartQuery.isLoading || fieldsQuery.isLoading) {
        return null;
    }

    const chartType = chartQuery.data.config.type;

    // TODO: add loading state
    if (chartType !== ChartKind.TABLE && chartLoading) {
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
                            spec={spec}
                            isLoading={chartLoading}
                            error={chartError}
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
                <ChartDataTable
                    columnNames={tableData?.columns ?? []}
                    rows={tableData?.rows ?? []}
                />
            ) : null}
        </Page>
    );
};

export default SemanticViewerViewPage;
