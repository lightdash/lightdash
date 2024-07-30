import { ChartKind } from '@lightdash/common';
import { Loader, Paper, Stack, Tabs } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import { HeaderViewMode } from '../features/sqlRunner/components/HeaderViewMode';
import BarChart from '../features/sqlRunner/components/visualizations/BarChart';
import { Table } from '../features/sqlRunner/components/visualizations/Table';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlChartAndResults } from '../features/sqlRunner/hooks/useSqlChartAndResults';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import {
    setProjectUuid,
    setSavedChartData,
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
    const savedSqlUuid = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart?.savedSqlUuid,
    );
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );
    const tableVisConfig = useAppSelector(
        (state) => state.tableVisConfig.config,
    );
    const barChartConfig = useAppSelector(
        (state) => state.barChartConfig.config,
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    const { error: chartError } = useSavedSqlChart({
        projectUuid,
        slug: params.slug,
        onSuccess: (data) => {
            dispatch(setSavedChartData(data));
        },
    });

    const {
        data,
        isLoading,
        error: chartAndResultsError,
    } = useSqlChartAndResults({
        projectUuid,
        savedSqlUuid: savedSqlUuid ?? null,
    });

    if (!projectUuid) {
        return null;
    }

    if (chartError) {
        return <ErrorState error={chartError.error} />;
    }
    if (chartAndResultsError) {
        return <ErrorState error={chartAndResultsError.error} />;
    }

    return (
        <Page
            title="SQL chart"
            noContentPadding
            withFullHeight
            header={<HeaderViewMode />}
        >
            <Stack h="100%" spacing={0}>
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
                    <Tabs
                        value={activeTab}
                        onTabChange={(val: TabOption) => setActiveTab(val)}
                    >
                        <Tabs.List>
                            <Tabs.Tab value={TabOption.CHART}>Chart</Tabs.Tab>
                            <Tabs.Tab
                                value={TabOption.RESULTS}
                                disabled={isLoading}
                            >
                                Results
                            </Tabs.Tab>
                            <Tabs.Tab
                                value={TabOption.SQL}
                                disabled={isLoading}
                            >
                                SQL
                            </Tabs.Tab>
                            {isLoading && <Loader mt="xs" size="xs" />}
                        </Tabs.List>
                    </Tabs>

                    {data?.results && !isLoading && (
                        <Paper shadow="none" radius={0} px={0} py="sm">
                            {activeTab === TabOption.CHART && (
                                <>
                                    {selectedChartType === ChartKind.TABLE && (
                                        <Table
                                            data={data.results}
                                            config={tableVisConfig}
                                        />
                                    )}
                                    {selectedChartType ===
                                        ChartKind.VERTICAL_BAR &&
                                        barChartConfig &&
                                        data && (
                                            <BarChart
                                                isLoading={isLoading}
                                                data={{
                                                    results: data.results,
                                                    columns: [],
                                                }}
                                                config={barChartConfig}
                                            />
                                        )}
                                </>
                            )}
                            {activeTab === TabOption.RESULTS && (
                                <Table
                                    data={data.results}
                                    config={resultsTableConfig}
                                />
                            )}
                            {activeTab === TabOption.SQL && (
                                <Prism language="sql" withLineNumbers>
                                    {sql || ''}
                                </Prism>
                            )}
                        </Paper>
                    )}
                </Paper>
            </Stack>
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
