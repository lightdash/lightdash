import {
    isBarChartSQLConfig,
    isPieChartSQLConfig,
    isTableChartSQLConfig,
} from '@lightdash/common';
import { Loader, Paper, Stack, Tabs } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import { Header } from '../features/sqlRunner/components/Header';
import SqlRunnerChart from '../features/sqlRunner/components/visualizations/SqlRunnerChart';
import { Table } from '../features/sqlRunner/components/visualizations/Table';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlQueryRun } from '../features/sqlRunner/hooks/useSqlChartResults';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import { selectCurrentChartConfig } from '../features/sqlRunner/store/selectors';
import {
    resetState,
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
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );
    const currentVisConfig = useAppSelector((state) =>
        selectCurrentChartConfig(state),
    );
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const { error: chartError, data: sqlChart } = useSavedSqlChart({
        projectUuid,
        slug: params.slug,
    });
    const {
        data,
        isLoading,
        error: resultsError,
    } = useSqlQueryRun(projectUuid, params.slug);

    useUnmount(() => {
        dispatch(resetState());
    });

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    useEffect(() => {
        if (sqlChart) {
            dispatch(setSavedChartData(sqlChart));
        }
    }, [dispatch, sqlChart]);

    if (chartError) {
        return <ErrorState error={chartError.error} />;
    }
    if (resultsError) {
        return <ErrorState error={resultsError.error} />;
    }

    return (
        <Page
            title="SQL chart"
            noContentPadding
            withFullHeight
            header={<Header mode="view" />}
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
                            {activeTab === TabOption.CHART && currentVisConfig && (
                                <>
                                    {isTableChartSQLConfig(
                                        currentVisConfig,
                                    ) && (
                                        <Table
                                            data={data.results}
                                            config={currentVisConfig}
                                        />
                                    )}
                                    {(isBarChartSQLConfig(currentVisConfig) ||
                                        isPieChartSQLConfig(
                                            currentVisConfig,
                                        )) &&
                                        data && (
                                            <SqlRunnerChart
                                                isLoading={isLoading}
                                                data={{
                                                    results: data.results,
                                                    columns: [],
                                                }}
                                                config={currentVisConfig}
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
