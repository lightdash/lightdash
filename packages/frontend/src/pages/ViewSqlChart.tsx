import { isTableChartSQLConfig } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import {
    IconChartHistogram,
    IconCodeCircle,
    IconTable,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Header } from '../features/sqlRunner/components/Header';
import SqlRunnerChart from '../features/sqlRunner/components/visualizations/SqlRunnerChart';
import { Table } from '../features/sqlRunner/components/visualizations/Table';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlChartResults } from '../features/sqlRunner/hooks/useSqlChartResults';
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
    } = useSqlChartResults(projectUuid, params.slug);

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
                                {
                                    value: TabOption.SQL,
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon
                                                icon={IconCodeCircle}
                                            />
                                            <Text>Query</Text>
                                        </Group>
                                    ),
                                },
                            ]}
                            value={activeTab}
                            onChange={(val: TabOption) => setActiveTab(val)}
                        />
                    </Group>

                    {data && !isLoading && (
                        <Box
                            sx={{
                                position: 'relative',
                                flex: 1,
                            }}
                        >
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
                                    {!isTableChartSQLConfig(currentVisConfig) &&
                                        data && (
                                            <SqlRunnerChart
                                                isLoading={isLoading}
                                                data={data}
                                                config={currentVisConfig}
                                                style={{
                                                    height: '100%',
                                                    width: '100%',
                                                }}
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
