import { isVizTableConfig } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import { ConditionalVisibility } from '../components/common/ConditionalVisibility';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { setChartConfig } from '../components/DataViz/store/actions/commonChartActions';
import { selectChartConfigByKind } from '../components/DataViz/store/selectors';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChart } from '../features/sqlRunner/hooks/useSavedSqlCharts';
import { useSqlChartResults } from '../features/sqlRunner/hooks/useSqlChartResults';
import { SqlRunnerResultsRunner } from '../features/sqlRunner/runners/SqlRunnerResultsRunner';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
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
    const { resultsTableConfig, selectedChartType, sql } = useAppSelector(
        (state) => state.sqlRunner,
    );

    const currentVisConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, selectedChartType),
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

    const resultsRunner = useMemo(
        () =>
            new SqlRunnerResultsRunner({
                rows: data?.results ?? [],
                columns: data?.columns ?? [],
            }),
        [data],
    );

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
                            ]}
                            value={activeTab}
                            onChange={(val: TabOption) => setActiveTab(val)}
                        />
                    </Group>

                    {chartError && <ErrorState error={chartError.error} />}
                    {resultsError && <ErrorState error={resultsError.error} />}

                    {data && !isLoading && (
                        <Box
                            sx={{
                                position: 'relative',
                                flex: 1,
                            }}
                        >
                            <ConditionalVisibility
                                isVisible={activeTab === TabOption.CHART}
                            >
                                {currentVisConfig && (
                                    <>
                                        {isVizTableConfig(currentVisConfig) && (
                                            <Table
                                                resultsRunner={resultsRunner}
                                                config={currentVisConfig}
                                            />
                                        )}
                                        {!isVizTableConfig(currentVisConfig) &&
                                            data &&
                                            params.slug && (
                                                <ChartView
                                                    resultsRunner={
                                                        resultsRunner
                                                    }
                                                    isLoading={isLoading}
                                                    config={currentVisConfig}
                                                    style={{
                                                        height: '100%',
                                                    }}
                                                    sql={sql}
                                                    projectUuid={projectUuid}
                                                    slug={params.slug}
                                                    limit={sqlChart?.limit}
                                                />
                                            )}
                                    </>
                                )}
                            </ConditionalVisibility>

                            <ConditionalVisibility
                                isVisible={activeTab === TabOption.RESULTS}
                            >
                                <Table
                                    resultsRunner={resultsRunner}
                                    config={resultsTableConfig}
                                />
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
