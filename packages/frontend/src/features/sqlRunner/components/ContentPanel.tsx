import {
    ChartKind,
    isVizTableConfig,
    type VizTableConfig,
} from '@lightdash/common';
import {
    Box,
    Group,
    Indicator,
    LoadingOverlay,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    Transition,
} from '@mantine/core';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
    IconChartHistogram,
    IconCodeCircle,
    IconGripHorizontal,
} from '@tabler/icons-react';
import type { EChartsInstance } from 'echarts-for-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import {
    Panel,
    PanelGroup,
    PanelResizeHandle,
    type ImperativePanelHandle,
} from 'react-resizable-panels';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartViz } from '../../../components/DataViz/hooks/useChartViz';
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import {
    cartesianChartSelectors,
    selectChartConfigByKind,
} from '../../../components/DataViz/store/selectors';
import getChartConfigAndOptions from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useSqlQueryRun,
    type ResultsAndColumns,
} from '../hooks/useSqlQueryRun';
import { SqlRunnerResultsRunner } from '../runners/SqlRunnerResultsRunner';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    setSqlLimit,
    setSqlRunnerResults,
} from '../store/sqlRunnerSlice';
import { ChartDownload } from './Download/ChartDownload';
import { ResultsDownload } from './Download/ResultsDownload';
import { SqlEditor, type MonacoHighlightChar } from './SqlEditor';
import { SqlQueryHistory } from './SqlQueryHistory';

const DEFAULT_SQL_LIMIT = 500;

export const ContentPanel: FC = () => {
    const dispatch = useAppDispatch();
    const { showToastError } = useToaster();
    const [panelSizes, setPanelSizes] = useState<number[]>([100, 0]);
    const resultsPanelRef = useRef<ImperativePanelHandle>(null);
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    // state for helping highlight errors in the editor
    const [hightlightError, setHightlightError] = useState<
        MonacoHighlightChar | undefined
    >(undefined);

    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();

    const fetchResultsOnLoad = useAppSelector(
        (state) => state.sqlRunner.fetchResultsOnLoad,
    );
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const activeEditorTab = useAppSelector(
        (state) => state.sqlRunner.activeEditorTab,
    );
    const limit = useAppSelector((state) => state.sqlRunner.limit);
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );

    // currently editing chart config
    const currentVizConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, selectedChartType),
    );

    const hideResultsPanel = useMemo(
        () =>
            activeEditorTab === EditorTabs.VISUALIZATION &&
            isVizTableConfig(currentVizConfig),
        [activeEditorTab, currentVizConfig],
    );

    const { mutateAsync: runSqlQuery, isLoading } = useSqlQueryRun(
        projectUuid,
        {
            onSuccess: (_data) => {
                // reset error highlighting
                setHightlightError(undefined);
            },
            onError: ({ error }) => {
                showToastError({
                    title: 'Could not fetch SQL query results',
                    subtitle: error.message,
                });

                if (error?.data) {
                    // highlight error in editor
                    const line = error?.data?.lineNumber;
                    const char = error?.data?.charNumber;
                    if (line && char) {
                        setHightlightError({
                            line: Number(error.data.lineNumber),
                            char: Number(error.data.charNumber),
                        });
                    }
                }
            },
        },
    );

    // React Query Mutation does not have a way to keep previous results
    // like the React Query useQuery hook does. So we need to store the results
    // in the state to keep them around when the query is re-run.
    const [queryResults, setQueryResults] = useState<ResultsAndColumns>();

    const handleRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse) return;
            const newQueryResults = await runSqlQuery({
                sql: sqlToUse,
                limit: DEFAULT_SQL_LIMIT,
            });

            setQueryResults(newQueryResults);
            notifications.clean();
        },
        [runSqlQuery, setQueryResults],
    );

    // Run query on cmd + enter
    useHotkeys([
        ['mod + enter', () => handleRunQuery, { preventDefault: true }],
    ]);

    useEffect(() => {
        if (fetchResultsOnLoad && !queryResults) {
            void handleRunQuery(sql);
        } else if (fetchResultsOnLoad && queryResults) {
            dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
        }
    }, [fetchResultsOnLoad, handleRunQuery, queryResults, dispatch, sql]);

    const resultsRunner = useMemo(() => {
        if (!queryResults) return;

        return new SqlRunnerResultsRunner({
            rows: queryResults.results,
            columns: queryResults.columns,
        });
    }, [queryResults]);

    useEffect(() => {
        if (queryResults && panelSizes[1] === 0) {
            resultsPanelRef.current?.resize(50);
            setPanelSizes([50, 50]);
        }
    }, [queryResults, panelSizes]);

    useEffect(() => {
        if (!queryResults || !resultsRunner || !selectedChartType) return;

        dispatch(setSqlRunnerResults(queryResults));

        const chartResultOptions = getChartConfigAndOptions(
            resultsRunner,
            selectedChartType,
            currentVizConfig,
        );

        dispatch(setChartOptionsAndConfig(chartResultOptions));
    }, [
        resultsRunner,
        dispatch,
        queryResults,
        selectedChartType,
        currentVizConfig,
    ]);

    const activeConfigs = useAppSelector((state) => {
        const configsWithTable = state.sqlRunner.activeConfigs
            .map((type) => selectChartConfigByKind(state, type))
            .filter(
                (config): config is NonNullable<typeof config> =>
                    config !== undefined,
            );

        const tableConfig = configsWithTable.find(isVizTableConfig);
        const chartConfigs = configsWithTable.filter(
            (
                c,
            ): c is Exclude<
                NonNullable<ReturnType<typeof selectChartConfigByKind>>,
                VizTableConfig
            > => !isVizTableConfig(c),
        );

        return {
            chartConfigs,
            tableConfig,
        };
    });

    const showTable = useMemo(
        () => isVizTableConfig(currentVizConfig),
        [currentVizConfig],
    );

    const showLimitText = useMemo(() => {
        return (
            queryResults?.results &&
            activeEditorTab === EditorTabs.SQL &&
            queryResults.results.length >= DEFAULT_SQL_LIMIT
        );
    }, [queryResults, activeEditorTab]);

    const showSqlResultsTable = useMemo(() => {
        return !!(
            (queryResults?.results && activeEditorTab === EditorTabs.SQL) ||
            currentVizConfig?.type === ChartKind.TABLE
        );
    }, [queryResults, activeEditorTab, currentVizConfig]);

    const showChartResultsTable = useMemo(() => {
        return !!(
            queryResults?.results &&
            activeEditorTab === EditorTabs.VISUALIZATION &&
            currentVizConfig?.type !== ChartKind.TABLE
        );
    }, [queryResults, activeEditorTab, currentVizConfig]);

    const canSetSqlLimit = useMemo(
        () => activeEditorTab === EditorTabs.VISUALIZATION,
        [activeEditorTab],
    );

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        config: currentVizConfig,
        sql,
        limit,
        additionalQueryKey: [sql],
    });

    const [activeEchartsInstance, setActiveEchartsInstance] =
        useState<EChartsInstance>();

    const chartFileUrl = chartVizQuery?.data?.fileUrl;
    const resultsFileUrl = queryResults?.fileUrl;

    const chartVizResultsRunner = useMemo(() => {
        if (!chartVizQuery.data) return;

        return new SqlRunnerResultsRunner({
            rows: chartVizQuery.data.results,
            columns: chartVizQuery.data.columns,
        });
    }, [chartVizQuery.data]);

    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    return (
        <Stack spacing="none" style={{ flex: 1, overflow: 'hidden' }}>
            <Tooltip.Group>
                <Paper
                    shadow="none"
                    radius={0}
                    px="md"
                    py={6}
                    bg="gray.1"
                    sx={(theme) => ({
                        borderWidth: '0 0 1px 1px',
                        borderStyle: 'solid',
                        borderColor: theme.colors.gray[3],
                    })}
                >
                    <Group position="apart">
                        <Group position="apart">
                            <Indicator
                                color="red.6"
                                offset={10}
                                disabled={!hasErrors}
                            >
                                <SegmentedControl
                                    styles={(theme) => ({
                                        root: {
                                            backgroundColor:
                                                theme.colors.gray[2],
                                        },
                                    })}
                                    size="sm"
                                    radius="md"
                                    data={[
                                        {
                                            value: EditorTabs.SQL,
                                            label: (
                                                <Tooltip
                                                    disabled={!hasUnrunChanges}
                                                    variant="xs"
                                                    withinPortal
                                                    label="You haven't run this query yet."
                                                >
                                                    <Group spacing={4} noWrap>
                                                        <MantineIcon
                                                            color={
                                                                hasUnrunChanges
                                                                    ? 'yellow.7'
                                                                    : 'gray.6'
                                                            }
                                                            icon={
                                                                IconCodeCircle
                                                            }
                                                        />
                                                        <Text
                                                            color={
                                                                hasUnrunChanges
                                                                    ? 'yellow.7'
                                                                    : 'gray.6'
                                                            }
                                                        >
                                                            SQL
                                                        </Text>
                                                    </Group>
                                                </Tooltip>
                                            ),
                                        },
                                        {
                                            value: EditorTabs.VISUALIZATION,
                                            label: (
                                                <Tooltip
                                                    disabled={
                                                        !!queryResults?.results
                                                    }
                                                    variant="xs"
                                                    withinPortal
                                                    label="Run a query to see the chart"
                                                >
                                                    <Group spacing={4} noWrap>
                                                        <MantineIcon
                                                            color="gray.6"
                                                            icon={
                                                                IconChartHistogram
                                                            }
                                                        />
                                                        <Text>Chart</Text>
                                                    </Group>
                                                </Tooltip>
                                            ),
                                        },
                                    ]}
                                    value={activeEditorTab}
                                    onChange={(value: EditorTabs) => {
                                        if (isLoading) {
                                            return;
                                        }

                                        if (
                                            value ===
                                                EditorTabs.VISUALIZATION &&
                                            !queryResults?.results
                                        ) {
                                            return;
                                        }

                                        dispatch(setActiveEditorTab(value));
                                    }}
                                />
                            </Indicator>
                        </Group>
                        <Group spacing="xs">
                            {activeEditorTab === EditorTabs.SQL && (
                                <SqlQueryHistory />
                            )}
                            <RunSqlQueryButton
                                isLoading={isLoading}
                                disabled={!sql}
                                onSubmit={() => handleRunQuery(sql)}
                                {...(canSetSqlLimit
                                    ? {
                                          onLimitChange: (l) =>
                                              dispatch(setSqlLimit(l)),
                                          limit,
                                      }
                                    : {})}
                            />
                            {activeEditorTab === EditorTabs.VISUALIZATION &&
                            !isVizTableConfig(currentVizConfig) &&
                            selectedChartType ? (
                                <ChartDownload
                                    fileUrl={chartFileUrl}
                                    columns={chartVizQuery?.data?.columns ?? []}
                                    chartName={savedSqlChart?.name}
                                    echartsInstance={activeEchartsInstance}
                                />
                            ) : (
                                <ResultsDownload
                                    fileUrl={resultsFileUrl}
                                    columns={queryResults?.columns ?? []}
                                    chartName={savedSqlChart?.name}
                                />
                            )}
                        </Group>
                    </Group>
                </Paper>

                <PanelGroup
                    direction="vertical"
                    onLayout={(sizes) => setPanelSizes(sizes)}
                >
                    <Panel
                        id="sql-runner-panel-sql-or-charts"
                        order={1}
                        minSize={30}
                        style={{ display: 'flex', flexDirection: 'column' }}
                    >
                        <Paper
                            ref={inputSectionRef}
                            shadow="none"
                            radius={0}
                            style={{ flex: 1 }}
                            sx={(theme) => ({
                                borderWidth: '0 0 0 1px',
                                borderStyle: 'solid',
                                borderColor: theme.colors.gray[3],
                                overflow: 'auto',
                            })}
                        >
                            <Box
                                style={{ flex: 1 }}
                                pt={
                                    activeEditorTab === EditorTabs.SQL
                                        ? 'md'
                                        : 0
                                }
                                sx={{
                                    position: 'absolute',
                                    overflowY: isVizTableConfig(
                                        currentVizConfig,
                                    )
                                        ? 'auto'
                                        : 'hidden',
                                    height: inputSectionHeight,
                                    width: inputSectionWidth,
                                }}
                            >
                                <ConditionalVisibility
                                    isVisible={
                                        activeEditorTab === EditorTabs.SQL
                                    }
                                >
                                    <SqlEditor
                                        resetHighlightError={() =>
                                            setHightlightError(undefined)
                                        }
                                        onSubmit={(submittedSQL) =>
                                            handleRunQuery(submittedSQL ?? '')
                                        }
                                        highlightText={
                                            hightlightError
                                                ? {
                                                      // set set single character highlight (no end/range defined)
                                                      start: hightlightError,
                                                      end: undefined,
                                                  }
                                                : undefined
                                        }
                                    />
                                </ConditionalVisibility>

                                <ConditionalVisibility
                                    isVisible={
                                        activeEditorTab ===
                                        EditorTabs.VISUALIZATION
                                    }
                                >
                                    {queryResults?.results &&
                                        resultsRunner &&
                                        currentVizConfig && (
                                            <>
                                                <Transition
                                                    keepMounted
                                                    mounted={!showTable}
                                                    transition="fade"
                                                    duration={400}
                                                    timingFunction="ease"
                                                >
                                                    {(styles) => (
                                                        <Box
                                                            px="sm"
                                                            pb="sm"
                                                            style={styles}
                                                        >
                                                            {activeConfigs.chartConfigs.map(
                                                                (c) => (
                                                                    <ConditionalVisibility
                                                                        key={
                                                                            c.type
                                                                        }
                                                                        isVisible={
                                                                            selectedChartType ===
                                                                            c.type
                                                                        }
                                                                    >
                                                                        <ChartView
                                                                            config={
                                                                                c
                                                                            }
                                                                            spec={
                                                                                chartSpec
                                                                            }
                                                                            isLoading={
                                                                                chartVizQuery.isFetching
                                                                            }
                                                                            error={
                                                                                chartVizQuery.error
                                                                            }
                                                                            style={{
                                                                                height: inputSectionHeight,
                                                                                flex: 1,
                                                                            }}
                                                                            onChartReady={(
                                                                                instance,
                                                                            ) => {
                                                                                if (
                                                                                    c.type ===
                                                                                    selectedChartType
                                                                                ) {
                                                                                    setActiveEchartsInstance(
                                                                                        instance,
                                                                                    );
                                                                                }
                                                                            }}
                                                                        />
                                                                    </ConditionalVisibility>
                                                                ),
                                                            )}
                                                        </Box>
                                                    )}
                                                </Transition>

                                                <Transition
                                                    keepMounted
                                                    mounted={showTable}
                                                    transition="fade"
                                                    duration={300}
                                                    timingFunction="ease"
                                                >
                                                    {(styles) => (
                                                        <Box
                                                            style={{
                                                                flex: 1,
                                                                height: inputSectionHeight,
                                                                ...styles,
                                                            }}
                                                        >
                                                            <ConditionalVisibility
                                                                isVisible={
                                                                    showTable
                                                                }
                                                            >
                                                                <Table
                                                                    resultsRunner={
                                                                        resultsRunner
                                                                    }
                                                                    columnsConfig={
                                                                        activeConfigs
                                                                            .tableConfig
                                                                            ?.columns ??
                                                                        {}
                                                                    }
                                                                    flexProps={{
                                                                        mah: '100%',
                                                                    }}
                                                                />
                                                            </ConditionalVisibility>
                                                        </Box>
                                                    )}
                                                </Transition>
                                            </>
                                        )}
                                </ConditionalVisibility>
                            </Box>
                        </Paper>
                    </Panel>

                    <Box
                        hidden={hideResultsPanel}
                        component={PanelResizeHandle}
                        bg="gray.1"
                        h={15}
                        sx={(theme) => ({
                            transition: 'background-color 0.2s ease-in-out',
                            cursor: 'row-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            '&:hover': {
                                backgroundColor: theme.colors.gray[2],
                            },
                            '&[data-resize-handle-state="drag"]': {
                                backgroundColor: theme.colors.gray[3],
                            },
                            gap: 5,
                        })}
                    >
                        <MantineIcon
                            color="gray"
                            icon={IconGripHorizontal}
                            size={12}
                        />

                        {showLimitText && (
                            <>
                                <Text fz="xs" fw={400} c="gray.7">
                                    Showing first {DEFAULT_SQL_LIMIT} rows
                                </Text>
                                <MantineIcon
                                    color="gray"
                                    icon={IconGripHorizontal}
                                    size={12}
                                />
                            </>
                        )}
                    </Box>

                    <Panel
                        id="sql-runner-panel-results"
                        order={2}
                        defaultSize={panelSizes[1]}
                        maxSize={500}
                        ref={resultsPanelRef}
                        style={{
                            display: hideResultsPanel ? 'none' : 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <Box
                            h="100%"
                            pos="relative"
                            sx={(theme) => ({
                                overflow: 'auto',
                                borderWidth: '0 0 1px 1px',
                                borderStyle: 'solid',
                                borderColor: theme.colors.gray[3],
                            })}
                        >
                            <LoadingOverlay
                                pos="absolute"
                                loaderProps={{
                                    size: 'xs',
                                }}
                                visible={isLoading}
                            />
                            {queryResults?.results && resultsRunner && (
                                <>
                                    <ConditionalVisibility
                                        isVisible={showSqlResultsTable}
                                    >
                                        <Table
                                            resultsRunner={resultsRunner}
                                            columnsConfig={
                                                resultsTableConfig?.columns ??
                                                {}
                                            }
                                            flexProps={{
                                                mah: '100%',
                                            }}
                                        />
                                    </ConditionalVisibility>

                                    <ConditionalVisibility
                                        isVisible={showChartResultsTable}
                                    >
                                        {selectedChartType &&
                                            chartVizQuery.data &&
                                            chartVizResultsRunner && (
                                                <Table
                                                    resultsRunner={
                                                        chartVizResultsRunner
                                                    }
                                                    columnsConfig={Object.fromEntries(
                                                        chartVizQuery.data.columns.map(
                                                            (field) => [
                                                                field.reference,
                                                                {
                                                                    visible:
                                                                        true,
                                                                    reference:
                                                                        field.reference,
                                                                    label: field.reference,
                                                                    frozen: false,
                                                                    // TODO: add aggregation
                                                                    // aggregation?: VizAggregationOptions;
                                                                },
                                                            ],
                                                        ),
                                                    )}
                                                    flexProps={{
                                                        mah: '100%',
                                                    }}
                                                />
                                            )}
                                    </ConditionalVisibility>
                                </>
                            )}
                        </Box>
                    </Panel>
                </PanelGroup>
            </Tooltip.Group>
        </Stack>
    );
};
