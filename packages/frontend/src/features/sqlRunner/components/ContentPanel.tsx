import {
    ChartKind,
    getParameterReferences,
    isVizTableConfig,
    MAX_PIVOT_COLUMN_LIMIT,
    MAX_SAFE_INTEGER,
    type VizTableConfig,
    type VizTableHeaderSortConfig,
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
    IconAlertCircle,
    IconChartHistogram,
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
import { updateChartSortBy } from '../../../components/DataViz/store/actions/commonChartActions';
import {
    cartesianChartSelectors,
    selectCompleteConfigByKind,
    selectPivotChartDataByKind,
} from '../../../components/DataViz/store/selectors';
import { ChartDataTable } from '../../../components/DataViz/visualizations/ChartDataTable';
import ChartView from '../../../components/DataViz/visualizations/ChartView';
import { Table } from '../../../components/DataViz/visualizations/Table';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import { Parameters } from '../../parameters';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    clearParameterValues,
    EditorTabs,
    selectActiveChartType,
    selectActiveEditorTab,
    selectFetchResultsOnLoad,
    selectLimit,
    selectParameterValues,
    selectProjectUuid,
    selectQueryUuid,
    selectResultsTableConfig,
    selectSavedSqlChart,
    selectSql,
    selectSqlQueryResults,
    selectSqlRunnerResultsRunner,
    setActiveEditorTab,
    setEditorHighlightError,
    setSqlLimit,
    updateParameterValue,
} from '../store/sqlRunnerSlice';
import { runSqlQuery } from '../store/thunks';
import { ChartDownload } from './Download/ChartDownload';
import ResultsDownloadButton from './Download/ResultsDownloadButton';
import { SqlEditor } from './SqlEditor';
import { SqlEditorPreferencesPopover } from './SqlEditorPreferencesPopover';
import { SqlQueryHistory } from './SqlQueryHistory';

export const ContentPanel: FC = () => {
    // State we need from redux
    const savedSqlChart = useAppSelector(selectSavedSqlChart);
    const fetchResultsOnLoad = useAppSelector(selectFetchResultsOnLoad);
    const projectUuid = useAppSelector(selectProjectUuid);
    const sql = useAppSelector(selectSql);
    const queryUuid = useAppSelector(selectQueryUuid);
    const selectedChartType = useAppSelector(selectActiveChartType);
    const activeEditorTab = useAppSelector(selectActiveEditorTab);
    const limit = useAppSelector(selectLimit);
    const resultsTableConfig = useAppSelector(selectResultsTableConfig);
    const isLoadingSqlQuery = useAppSelector(
        (state) => state.sqlRunner.queryIsLoading,
    );
    const queryError = useAppSelector((state) => state.sqlRunner.queryError);
    const editorHighlightError = useAppSelector(
        (state) => state.sqlRunner.editorHighlightError,
    );
    // So we can dispatch to redux
    const dispatch = useAppDispatch();

    // Get organization colors to generate chart specs with a color palette defined by the organization
    const { data: organization } = useOrganization();
    const { health } = useApp();

    const { showToastError } = useToaster();

    // State tracked by this component
    const [panelSizes, setPanelSizes] = useState<number[]>([100, 0]);
    const resultsPanelRef = useRef<ImperativePanelHandle>(null);

    // state for helping highlight errors in the editor

    const mode = useAppSelector((state) => state.sqlRunner.mode);

    const {
        ref: inputSectionRef,
        width: inputSectionWidth,
        height: inputSectionHeight,
    } = useElementSize();

    // Parameter state management for SQL Runner context
    const parameterValues = useAppSelector(selectParameterValues);

    const handleParameterChange = useCallback(
        (key: string, value: string | string[] | null) => {
            dispatch(updateParameterValue({ key, value }));
        },
        [dispatch],
    );

    const parameterReferences = useMemo(() => {
        return new Set(getParameterReferences(sql));
    }, [sql]);

    const clearAllParameters = useCallback(() => {
        dispatch(clearParameterValues());
    }, [dispatch]);

    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, selectedChartType),
    );

    const hideResultsPanel = useMemo(
        () =>
            activeEditorTab === EditorTabs.VISUALIZATION &&
            selectedChartType === ChartKind.TABLE,
        [activeEditorTab, selectedChartType],
    );

    const queryResults = useAppSelector(selectSqlQueryResults);

    const handleRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse || !limit) return;

            await dispatch(
                runSqlQuery({
                    sql: sqlToUse,
                    limit,
                    projectUuid,
                    parameterValues,
                }),
            );
        },
        [dispatch, projectUuid, limit, parameterValues],
    );

    useEffect(() => {
        if (queryError) {
            showToastError({
                title: 'Could not fetch SQL query results',
                subtitle: queryError.message,
            });
        } else {
            notifications.clean();
        }
    }, [queryError, showToastError]);

    // Run query on cmd + enter
    useHotkeys([
        ['mod + enter', () => handleRunQuery, { preventDefault: true }],
    ]);

    useEffect(
        // When the user opens the sql runner and the query results are not yet loaded, run the query and then change to the visualization tab
        function handleEditModeOnLoad() {
            if (fetchResultsOnLoad && !queryResults) {
                void handleRunQuery(sql);
            } else if (
                fetchResultsOnLoad &&
                queryResults &&
                mode === 'default'
            ) {
                dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
            }
        },
        [fetchResultsOnLoad, handleRunQuery, queryResults, dispatch, sql, mode],
    );

    const activeConfigs = useAppSelector((state) => {
        const configsWithTable = state.sqlRunner.activeConfigs
            .map((type) => selectCompleteConfigByKind(state, type))
            .filter(
                (config): config is NonNullable<typeof config> =>
                    config !== undefined,
            );

        const tableConfig = configsWithTable.find(isVizTableConfig);
        const chartConfigs = configsWithTable.filter(
            (
                c,
            ): c is Exclude<
                NonNullable<ReturnType<typeof selectCompleteConfigByKind>>,
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

    const resultsRunner = useAppSelector((state) =>
        selectSqlRunnerResultsRunner(state),
    );

    const pivotedChartInfo = useAppSelector((state) =>
        selectPivotChartDataByKind(state, selectedChartType),
    );

    const hasReachedPivotColumnLimit = useMemo(
        () =>
            pivotedChartInfo?.data?.columnCount &&
            pivotedChartInfo?.data?.columnCount > MAX_PIVOT_COLUMN_LIMIT,
        [pivotedChartInfo],
    );

    useEffect(() => {
        if (queryResults && panelSizes[1] === 0) {
            resultsPanelRef.current?.resize(50);
            setPanelSizes([50, 50]);
        }
    }, [queryResults, panelSizes]);

    const defaultQueryLimit = useMemo(() => {
        return health.data?.query.defaultLimit ?? DEFAULT_SQL_LIMIT;
    }, [health]);

    useEffect(() => {
        if (!limit) {
            dispatch(setSqlLimit(defaultQueryLimit));
        }
    }, [defaultQueryLimit, dispatch, limit]);

    const [activeEchartsInstance, setActiveEchartsInstance] =
        useState<EChartsInstance>();

    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    const handleTableHeaderClick = useCallback(
        (fieldName: string) => {
            dispatch(updateChartSortBy(fieldName));
        },
        [dispatch],
    );

    // TODO: can this just go in the table?
    const sortConfig: VizTableHeaderSortConfig | undefined = useMemo(() => {
        if (!currentVizConfig || isVizTableConfig(currentVizConfig)) {
            return undefined;
        }

        const isPivoted =
            currentVizConfig.fieldConfig?.groupBy &&
            currentVizConfig.fieldConfig?.groupBy.length > 0;

        return pivotedChartInfo?.data?.tableData?.columns.reduce<VizTableHeaderSortConfig>(
            (acc, col) => {
                if (
                    isPivoted &&
                    pivotedChartInfo.data?.indexColumn?.reference !== col
                ) {
                    return acc;
                }

                const columnSort = currentVizConfig?.fieldConfig?.sortBy?.find(
                    (sort) => sort.reference === col,
                );

                return {
                    ...acc,
                    [col]: {
                        direction: columnSort?.direction,
                    },
                };
            },
            {},
        );
    }, [currentVizConfig, pivotedChartInfo]);

    const getDownloadQueryUuid = useCallback(
        async (downloadLimit: number | null) => {
            // Always execute a new query if:
            // 1. limit is null (meaning "all results" - should ignore existing query limits)
            // 2. limit is different from current query
            // 3. there is no fallback query uuid (in theory, never happens)
            if (!queryUuid || limit === null || limit !== downloadLimit) {
                const newQuery = await executeSqlQuery(
                    projectUuid,
                    sql,
                    downloadLimit === null
                        ? MAX_SAFE_INTEGER
                        : downloadLimit ?? limit,
                );
                return newQuery.queryUuid;
            }
            return queryUuid;
        },
        [sql, projectUuid, limit, queryUuid],
    );

    const getDownloadPivotQueryUuid = useCallback(async () => {
        if (!pivotedChartInfo?.data?.queryUuid) {
            throw new Error('No query uuid to download');
        }
        return pivotedChartInfo?.data?.queryUuid;
    }, [pivotedChartInfo]);

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
                                disabled={!hasErrors || mode === 'virtualView'}
                            >
                                <SegmentedControl
                                    display={
                                        mode === 'virtualView'
                                            ? 'none'
                                            : undefined
                                    }
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
                                                        <SqlEditorPreferencesPopover />

                                                        <Text>SQL</Text>
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
                                        if (isLoadingSqlQuery) {
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
                            <Parameters
                                isEditMode={false}
                                parameterReferences={parameterReferences}
                                parameterValues={parameterValues}
                                onParameterChange={handleParameterChange}
                                onClearAll={clearAllParameters}
                            />
                            {activeEditorTab === EditorTabs.SQL && (
                                <SqlQueryHistory />
                            )}
                            <RunSqlQueryButton
                                isLoading={isLoadingSqlQuery}
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
                                    chartName={savedSqlChart?.name}
                                    echartsInstance={activeEchartsInstance}
                                    projectUuid={projectUuid}
                                    disabled={isLoadingSqlQuery}
                                    hideLimitSelection={true}
                                    totalResults={
                                        resultsRunner.getRows().length
                                    }
                                    columnOrder={
                                        pivotedChartInfo?.data?.columns?.map(
                                            (c) => c.reference,
                                        ) ?? []
                                    }
                                    getDownloadQueryUuid={
                                        getDownloadPivotQueryUuid
                                    }
                                />
                            ) : (
                                mode === 'default' && (
                                    <ResultsDownloadButton
                                        projectUuid={projectUuid}
                                        disabled={isLoadingSqlQuery}
                                        chartName={savedSqlChart?.name}
                                        vizTableConfig={
                                            isVizTableConfig(currentVizConfig)
                                                ? currentVizConfig
                                                : undefined
                                        }
                                        totalResults={
                                            resultsRunner.getRows().length
                                        }
                                        columnOrder={resultsRunner.getColumnNames()}
                                        getDownloadQueryUuid={
                                            getDownloadQueryUuid
                                        }
                                    />
                                )
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
                                            dispatch(
                                                setEditorHighlightError(
                                                    undefined,
                                                ),
                                            )
                                        }
                                        onSubmit={(submittedSQL) =>
                                            handleRunQuery(submittedSQL ?? '')
                                        }
                                        highlightText={
                                            editorHighlightError
                                                ? {
                                                      // set set single character highlight (no end/range defined)
                                                      start: editorHighlightError,
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
                                                                // TODO: are we rendering all charts here?
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
                                                                            spec={pivotedChartInfo?.data?.getChartSpec(
                                                                                organization?.chartColors,
                                                                            )}
                                                                            isLoading={
                                                                                !!pivotedChartInfo?.loading
                                                                            }
                                                                            error={
                                                                                pivotedChartInfo?.error
                                                                            }
                                                                            style={{
                                                                                height: inputSectionHeight,
                                                                                flex: inputSectionWidth,
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
                            display: hideResultsPanel ? 'none' : 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            '&:hover': {
                                backgroundColor: theme.colors.gray[2],
                            },
                            '&[data-resize-handle-state="drag"]': {
                                backgroundColor: theme.colors.gray[3],
                            },
                            borderLeft: `1px solid ${theme.colors.gray[3]}`,
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
                                    Showing first {defaultQueryLimit} rows
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
                        className="sentry-block ph-no-capture"
                    >
                        <Box
                            h="100%"
                            pos="relative"
                            sx={{
                                overflow: 'auto',
                            }}
                        >
                            <LoadingOverlay
                                pos="absolute"
                                loaderProps={{
                                    size: 'xs',
                                }}
                                visible={isLoadingSqlQuery}
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
                                            pivotedChartInfo?.data
                                                ?.tableData && (
                                                <>
                                                    {hasReachedPivotColumnLimit && (
                                                        <Group
                                                            position="center"
                                                            spacing="xs"
                                                        >
                                                            <MantineIcon
                                                                color="gray"
                                                                icon={
                                                                    IconAlertCircle
                                                                }
                                                            />
                                                            <Text
                                                                fz="xs"
                                                                fw={400}
                                                                c="gray.7"
                                                                ta="center"
                                                            >
                                                                This query
                                                                exceeds the
                                                                maximum number
                                                                of columns (
                                                                {
                                                                    MAX_PIVOT_COLUMN_LIMIT
                                                                }
                                                                ). Showing the
                                                                first{' '}
                                                                {
                                                                    MAX_PIVOT_COLUMN_LIMIT
                                                                }{' '}
                                                                columns.
                                                            </Text>
                                                        </Group>
                                                    )}
                                                    <ChartDataTable
                                                        columnNames={
                                                            pivotedChartInfo
                                                                ?.data.tableData
                                                                ?.columns
                                                        }
                                                        rows={
                                                            pivotedChartInfo
                                                                ?.data.tableData
                                                                ?.rows ?? []
                                                        }
                                                        flexProps={{
                                                            mah: '100%',
                                                        }}
                                                        onTHClick={
                                                            handleTableHeaderClick
                                                        }
                                                        thSortConfig={
                                                            sortConfig
                                                        }
                                                    />
                                                </>
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
