import { ChartKind, isVizTableConfig } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import type { EChartsInstance } from 'echarts-for-react';
import { useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useAsync, useUnmount } from 'react-use';
import { ConditionalVisibility } from '../components/common/ConditionalVisibility';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import {
    resetChartState,
    setChartConfig,
} from '../components/DataViz/store/actions/commonChartActions';
import {
    selectChartDisplayByKind,
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../components/DataViz/store/selectors';
import getChartDataModel from '../components/DataViz/transformers/getChartDataModel';
import { ChartDataTable } from '../components/DataViz/visualizations/ChartDataTable';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import { ChartDownload } from '../features/sqlRunner/components/Download/ChartDownload';
import { ResultsDownload } from '../features/sqlRunner/components/Download/ResultsDownload';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlChartResults } from '../features/sqlRunner/hooks/useSqlChartResults';
import { SqlRunnerResultsRunnerFrontend } from '../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import {
    resetState,
    setProjectUuid,
    setSavedChartData,
    setSqlRunnerResults,
} from '../features/sqlRunner/store/sqlRunnerSlice';

enum TabOption {
    CHART = 'chart',
    RESULTS = 'results',
    SQL = 'sql',
}

const ViewSqlChart = () => {
    const dispatch = useAppDispatch();
    const params = useParams<{ projectUuid: string; slug?: string }>();
    const [activeTab, setActiveTab] = useState<TabOption>(TabOption.CHART);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);

    const currentFieldConfig = useAppSelector((state) =>
        selectChartFieldConfigByKind(state, selectedChartType),
    );

    const currentDisplay = useAppSelector((state) =>
        selectChartDisplayByKind(state, selectedChartType),
    );

    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, selectedChartType),
    );

    const { error: chartError, data: sqlChart } = useSavedSqlChart({
        projectUuid,
        slug: params.slug,
    });
    const {
        data,
        isLoading,
        error: resultsError,
    } = useSqlChartResults(projectUuid, params.slug);

    useUnmount(() => {
        dispatch(resetState());
        dispatch(resetChartState());
    });

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    useEffect(() => {
        if (sqlChart) {
            dispatch(setSavedChartData(sqlChart));
            dispatch(setChartConfig(sqlChart.config));
        }
    }, [dispatch, sqlChart]);

    useEffect(() => {
        if (!data) return;
        dispatch(setSqlRunnerResults(data));
    }, [data, dispatch]);

    const resultsRunner = useMemo(() => {
        return new SqlRunnerResultsRunnerFrontend({
            rows: data?.results ?? [],
            columns: data?.columns ?? [],
            projectUuid,
            sql,
        });
    }, [data, projectUuid, sql]);

    const vizDataModel = useMemo(() => {
        return getChartDataModel(
            resultsRunner,
            currentFieldConfig,
            selectedChartType ?? ChartKind.VERTICAL_BAR,
        );
    }, [currentFieldConfig, resultsRunner, selectedChartType]);

    const {
        loading: chartLoading,
        error: chartDataError,
        value: chartData,
    } = useAsync(async () => {
        return vizDataModel.getPivotedChartData({
            limit: sqlChart?.limit,
            sql,
            sortBy: [],
            filters: [],
        });
    }, [vizDataModel, sqlChart?.limit, sql]);

    const { chartSpec, tableData, fileUrl } = useMemo(() => {
        if (!chartData)
            return {
                chartSpec: undefined,
                tableData: undefined,
                fileUrl: undefined,
            };

        return {
            chartSpec: vizDataModel.getSpec(currentDisplay),
            tableData: vizDataModel.getPivotedTableData(),
            fileUrl: vizDataModel.getDataDownloadUrl(),
        };
    }, [vizDataModel, currentDisplay, chartData]);

    const [echartsInstance, setEchartsInstance] = useState<EChartsInstance>();

    return (
        <Page
            title="SQL chart"
            noContentPadding
            withFullHeight
            header={<Header mode="view" />}
        >
            <Paper
                shadow="none"
                radius={0}
                px="md"
                pb={0}
                pt="sm"
                sx={{
                    flex: 1,
                }}
            >
                <Stack h="100%">
                    <Group position="apart">
                        <Group position="apart">
                            <SegmentedControl
                                color="dark"
                                size="sm"
                                radius="sm"
                                disabled={isLoading}
                                data={[
                                    {
                                        value: TabOption.CHART,
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
                                        value: TabOption.RESULTS,
                                        label: (
                                            <Group spacing="xs" noWrap>
                                                <MantineIcon icon={IconTable} />
                                                <Text>Results</Text>
                                            </Group>
                                        ),
                                    },
                                ]}
                                value={activeTab}
                                onChange={(val: TabOption) => setActiveTab(val)}
                            />
                        </Group>
                        {activeTab === TabOption.RESULTS && (
                            <ResultsDownload
                                fileUrl={fileUrl}
                                columnNames={tableData?.columns ?? []}
                                chartName={sqlChart?.name}
                            />
                        )}
                        {activeTab === TabOption.CHART && echartsInstance && (
                            <ChartDownload
                                echartsInstance={echartsInstance}
                                fileUrl={fileUrl}
                                columnNames={tableData?.columns ?? []}
                                chartName={sqlChart?.name}
                            />
                        )}
                    </Group>

                    {chartError && <ErrorState error={chartError.error} />}
                    {resultsError && <ErrorState error={resultsError.error} />}

                    {data && !isLoading && (
                        <Box
                            h="100%"
                            sx={{
                                position: 'relative',
                                flex: 1,
                            }}
                        >
                            <ConditionalVisibility
                                isVisible={activeTab === TabOption.CHART}
                            >
                                {currentFieldConfig && (
                                    <>
                                        {isVizTableConfig(currentVizConfig) &&
                                            resultsTableConfig && (
                                                <Table
                                                    resultsRunner={
                                                        resultsRunner
                                                    }
                                                    columnsConfig={
                                                        // TODO: this is a temporary fix to handle the case where the columns config is not set
                                                        // TODO: ensure columns config is sent and processed in the backend correctly
                                                        Object.keys(
                                                            currentVizConfig.columns,
                                                        ).length > 0
                                                            ? currentVizConfig.columns
                                                            : resultsTableConfig.columns
                                                    }
                                                    flexProps={{
                                                        mah: 'calc(100vh - 250px)',
                                                    }}
                                                />
                                            )}
                                        {!isVizTableConfig(currentVizConfig) &&
                                            data &&
                                            params.slug &&
                                            sql && (
                                                <ChartView
                                                    config={currentVizConfig}
                                                    spec={chartSpec}
                                                    isLoading={
                                                        isLoading ||
                                                        chartLoading
                                                    }
                                                    error={chartDataError}
                                                    style={{ height: '100%' }}
                                                    onChartReady={
                                                        setEchartsInstance
                                                    }
                                                />
                                            )}
                                    </>
                                )}
                            </ConditionalVisibility>
                            <ConditionalVisibility
                                isVisible={activeTab === TabOption.RESULTS}
                            >
                                {!isVizTableConfig(currentVizConfig) &&
                                    tableData && (
                                        <ChartDataTable
                                            columnNames={
                                                tableData?.columns ?? []
                                            }
                                            rows={tableData?.rows ?? []}
                                            flexProps={{
                                                mah: '100%',
                                            }}
                                        />
                                    )}

                                {isVizTableConfig(currentVizConfig) &&
                                    resultsTableConfig && (
                                        <Table
                                            resultsRunner={resultsRunner}
                                            columnsConfig={
                                                resultsTableConfig?.columns
                                            }
                                            flexProps={{
                                                mah: 'calc(100vh - 250px)',
                                            }}
                                        />
                                    )}
                            </ConditionalVisibility>
                        </Box>
                    )}
                </Stack>
            </Paper>
        </Page>
    );
};

const ViewSqlChartPage = () => {
    return (
        <Provider store={store}>
            <ViewSqlChart />
        </Provider>
    );
};
export default ViewSqlChartPage;
