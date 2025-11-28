import {
    getParameterReferences,
    isVizTableConfig,
    type ParameterValue,
} from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine/core';
import { IconChartHistogram, IconTable } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import { ChartDataTable } from '../components/DataViz/visualizations/ChartDataTable';
import ChartView from '../components/DataViz/visualizations/ChartView';
import { Table } from '../components/DataViz/visualizations/Table';
import type { EChartsInstance } from '../components/EChartsReactWrapper';
import { ConditionalVisibility } from '../components/common/ConditionalVisibility';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { Parameters, useParameters } from '../features/parameters';
import { ChartDownload } from '../features/sqlRunner/components/Download/ChartDownload';
import ResultsDownloadButton from '../features/sqlRunner/components/Download/ResultsDownloadButton';
import { Header } from '../features/sqlRunner/components/Header';
import { useSavedSqlChartResults } from '../features/sqlRunner/hooks/useSavedSqlChartResults';
import { store } from '../features/sqlRunner/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/sqlRunner/store/hooks';
import {
    clearParameterValues,
    selectParameterValues,
    setProjectUuid,
    setSavedChartData,
    updateParameterValue,
} from '../features/sqlRunner/store/sqlRunnerSlice';

enum TabOption {
    CHART = 'chart',
    RESULTS = 'results',
    SQL = 'sql',
}

const ViewSqlChart = () => {
    const params = useParams<{ projectUuid: string; slug?: string }>();
    const dispatch = useAppDispatch();
    const [activeTab, setActiveTab] = useState<TabOption>(TabOption.CHART);

    const [echartsInstance, setEchartsInstance] = useState<EChartsInstance>();

    // Parameter state management for SQL Runner context
    const parameterValues = useAppSelector(selectParameterValues);

    const {
        chartQuery: {
            data: chartData,
            isLoading: isChartLoading,
            error: chartError,
        },
        chartResultsQuery: {
            data: chartResultsData,
            isLoading: isChartResultsLoading,
            error: chartResultsError,
            isFetching: isChartResultsFetching,
        },
        getDownloadQueryUuid,
    } = useSavedSqlChartResults({
        projectUuid: params.projectUuid,
        slug: params.slug,
        parameters: parameterValues,
    });

    const handleParameterChange = useCallback(
        (key: string, value: ParameterValue | null) => {
            dispatch(updateParameterValue({ key, value }));
        },
        [dispatch],
    );

    const parameterReferences = useMemo(() => {
        return new Set(getParameterReferences(chartData?.sql ?? ''));
    }, [chartData]);

    const clearAllParameters = useCallback(() => {
        dispatch(clearParameterValues());
    }, [dispatch]);

    // TODO: remove state sync - this is because the <Header /> component depends on the Redux state
    useEffect(() => {
        if (chartData) {
            dispatch(setSavedChartData(chartData));
        }
        if (params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, chartData, params.projectUuid]);

    const {
        data: projectParameters,
        isLoading: isProjectParametersLoading,
        isError: isProjectParametersError,
    } = useParameters(
        params.projectUuid,
        Array.from(parameterReferences ?? []),
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
                        <Group position="apart">
                            <SegmentedControl
                                styles={(theme) => ({
                                    root: {
                                        backgroundColor: theme.colors.ldGray[2],
                                    },
                                })}
                                size="sm"
                                radius="md"
                                disabled={isChartResultsLoading}
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
                        <Group position="apart">
                            <Parameters
                                isEditMode={false}
                                parameters={projectParameters}
                                parameterValues={parameterValues}
                                onParameterChange={handleParameterChange}
                                onClearAll={clearAllParameters}
                                isLoading={isProjectParametersLoading}
                                isError={isProjectParametersError}
                            />
                            {(activeTab === TabOption.RESULTS ||
                                (activeTab === TabOption.CHART &&
                                    isVizTableConfig(chartData?.config))) &&
                                params.projectUuid && (
                                    <ResultsDownloadButton
                                        projectUuid={params.projectUuid}
                                        disabled={!chartResultsData}
                                        vizTableConfig={
                                            isVizTableConfig(chartData?.config)
                                                ? chartData.config
                                                : undefined
                                        }
                                        chartName={chartData?.name}
                                        totalResults={
                                            chartResultsData
                                                ?.chartUnderlyingData?.rows
                                                .length ?? 0
                                        }
                                        columnOrder={
                                            chartResultsData
                                                ?.chartUnderlyingData
                                                ?.columns ?? []
                                        }
                                        getDownloadQueryUuid={
                                            getDownloadQueryUuid
                                        }
                                    />
                                )}
                            {activeTab === TabOption.CHART &&
                                echartsInstance &&
                                params.projectUuid && (
                                    <ChartDownload
                                        echartsInstance={echartsInstance}
                                        chartName={chartData?.name}
                                        projectUuid={params.projectUuid}
                                        disabled={!chartResultsData}
                                        totalResults={
                                            chartResultsData
                                                ?.chartUnderlyingData?.rows
                                                .length ?? 0
                                        }
                                        columnOrder={
                                            chartResultsData
                                                ?.chartUnderlyingData
                                                ?.columns ?? []
                                        }
                                        getDownloadQueryUuid={
                                            getDownloadQueryUuid
                                        }
                                    />
                                )}
                        </Group>
                    </Group>

                    {chartError && <ErrorState error={chartError.error} />}
                    {chartResultsError && (
                        <ErrorState error={chartResultsError.error} />
                    )}

                    {chartData && !isChartLoading && (
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
                                {
                                    <>
                                        {isVizTableConfig(chartData.config) &&
                                            chartResultsData && (
                                                <Table
                                                    resultsRunner={
                                                        chartResultsData.resultsRunner
                                                    }
                                                    columnsConfig={
                                                        chartData.config.columns
                                                    }
                                                    flexProps={{
                                                        mah: 'calc(100vh - 250px)',
                                                    }}
                                                />
                                            )}
                                        {!isVizTableConfig(chartData.config) &&
                                            params.slug &&
                                            chartData.sql && (
                                                <ChartView
                                                    config={chartData.config}
                                                    spec={
                                                        chartResultsData?.chartSpec
                                                    }
                                                    isLoading={
                                                        isChartLoading ||
                                                        isChartResultsFetching
                                                    }
                                                    error={
                                                        chartResultsError?.error
                                                    }
                                                    style={{ height: '100%' }}
                                                    onChartReady={
                                                        setEchartsInstance
                                                    }
                                                />
                                            )}
                                    </>
                                }
                            </ConditionalVisibility>
                            <ConditionalVisibility
                                isVisible={activeTab === TabOption.RESULTS}
                            >
                                {!isVizTableConfig(chartData.config) &&
                                    chartResultsData && (
                                        <ChartDataTable
                                            columnNames={
                                                chartResultsData
                                                    .chartUnderlyingData
                                                    ?.columns ?? []
                                            }
                                            rows={
                                                chartResultsData
                                                    .chartUnderlyingData
                                                    ?.rows ?? []
                                            }
                                            flexProps={{
                                                mah: '100%',
                                            }}
                                        />
                                    )}

                                {isVizTableConfig(chartData.config) &&
                                    chartResultsData && (
                                        <Table
                                            resultsRunner={
                                                chartResultsData.resultsRunner
                                            }
                                            columnsConfig={
                                                chartData.config.columns
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
