import {
    ChartKind,
    getFirstIndexColumns,
    getParameterReferences,
    isVizBigNumberConfig,
    isVizTableConfig,
    type VizTableConfig,
    type VizTableHeaderSortConfig,
    formatSql,
    type ApiErrorDetail,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    CopyButton,
    Divider,
    Group,
    Kbd,
    Loader,
    Skeleton,
    Stack,
    Text,
    ActionIcon,
    Indicator,
    SegmentedControl,
    Title,
    Transition,
    Tooltip,
} from '@mantine/core';
import {
    useElementSize,
    useHotkeys,
    useOs,
    type SplitterPaneSize,
} from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { SerializedError } from '@reduxjs/toolkit';
import {
    IconAlertCircle,
    IconChartHistogram,
    IconCode,
    IconIndentIncrease,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import { updateChartSortBy } from '../../../components/DataViz/store/actions/commonChartActions';
import {
    cartesianChartSelectors,
    selectCompleteConfigByKind,
    selectPivotChartDataByKind,
} from '../../../components/DataViz/store/selectors';
import { ChartDataTable } from '../../../components/DataViz/visualizations/ChartDataTable';
import { Table } from '../../../components/DataViz/visualizations/Table';
import type { EChartsInstance } from '../../../components/EChartsReactWrapper';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { Parameters, useParameters } from '../../parameters';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useRunQueryOnLoad } from '../hooks/useRunQueryOnLoad';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { startAppListening } from '../store/listenerMiddleware';
import { addAutomaticPivotFailureListener } from '../store/sqlRunnerListeners';
import {
    clearParameterValues,
    EditorTabs,
    selectActiveChartType,
    selectActiveEditorTab,
    selectConnectionUuid,
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
    requestEditorReveal,
    setEditorHighlightError,
    setSql,
    setSqlLimit,
    updateParameterValue,
} from '../store/sqlRunnerSlice';
import { prepareAndFetchChartData, runSqlQuery } from '../store/thunks';
import { executeSqlDownloadQuery } from '../utils/executeSqlDownloadQuery';
import styles from './ContentPanel.module.css';
import { ChartDownload } from './Download/ChartDownload';
import ResultsDownloadButton from './Download/ResultsDownloadButton';
import { type MonacoHighlightChar } from './SqlEditor';
import { SqlQueryHistory } from './SqlQueryHistory';
import { SqlRunnerChart } from './SqlRunnerChart';
import { SqlRunnerEditor } from './SqlRunnerEditor';

const isPreviewWarehouseSignInExpiredError = (
    error: ApiErrorDetail | SerializedError | Error,
): error is ApiErrorDetail =>
    'statusCode' in error &&
    'data' in error &&
    error.name === 'PreviewWarehouseSignInExpiredError';

const useQueryErrorToast = (
    queryError: ApiErrorDetail | SerializedError | Error | undefined,
    projectUuid: string | undefined,
) => {
    const { showToastApiError } = useToaster();
    useEffect(() => {
        if (queryError && isPreviewWarehouseSignInExpiredError(queryError)) {
            showToastApiError({
                title: 'Could not fetch SQL query results',
                apiError: queryError,
                projectUuid,
            });
        } else {
            notifications.clean();
        }
    }, [queryError, projectUuid, showToastApiError]);
};

const ElapsedTime: FC = () => {
    const [elapsedMs, setElapsedMs] = useState(0);
    useEffect(() => {
        const startedAt = Date.now();
        const timer = setInterval(
            () => setElapsedMs(Date.now() - startedAt),
            100,
        );
        return () => clearInterval(timer);
    }, []);
    return <>{(elapsedMs / 1000).toFixed(1)}s</>;
};

const SKELETON_WIDTHS = [
    [120, 64],
    [96, 48],
    [140, 72],
    [80, 56],
    [128, 40],
    [104, 64],
    [88, 48],
    [136, 60],
];

const ResultsSkeleton: FC = () => (
    <Box>
        {SKELETON_WIDTHS.map(([first, second], index) => (
            <Box key={index} className={styles.skeletonRow}>
                <Skeleton height={8} width={20} radius="xl" />
                <Skeleton height={8} width={first} radius="xl" />
                <Skeleton height={8} width={second} radius="xl" />
            </Box>
        ))}
    </Box>
);

const EmptyResultsHints: FC = () => {
    const os = useOs();
    const modifierKey = os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl';
    return (
        <Group gap={4} wrap="nowrap" className={styles.emptyHints}>
            <Kbd size="xs">{modifierKey}</Kbd>
            <Kbd size="xs">↵</Kbd>
            <Text fz="xs" c="dimmed" mr="xs">
                run
            </Text>
            <Kbd size="xs">⇧{modifierKey}↵</Kbd>
            <Text fz="xs" c="dimmed">
                selection
            </Text>
        </Group>
    );
};

const QueryErrorBlock: FC<{
    message: string;
    position: MonacoHighlightChar | undefined;
    onReveal: (position: MonacoHighlightChar) => void;
}> = ({ message, position, onReveal }) => (
    <Stack gap="xs" className={styles.errorBlock}>
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <MantineIcon icon={IconAlertCircle} color="red" />
            <Text fz="xs" fw={500} c="red" flex={1}>
                {message}
            </Text>
            {position && (
                <Anchor
                    component="button"
                    type="button"
                    fz="xs"
                    onClick={() => onReveal(position)}
                >
                    Line {position.line}
                </Anchor>
            )}
        </Group>
        <Group gap="xs">
            <CopyButton value={message}>
                {({ copied, copy }) => (
                    <Button size="xs" variant="default" onClick={copy}>
                        {copied ? 'Copied' : 'Copy error'}
                    </Button>
                )}
            </CopyButton>
        </Group>
    </Stack>
);

export const ContentPanel: FC<{ toolbarActions?: ReactNode }> = ({
    toolbarActions,
}) => {
    const lightdashApi = useLightdashApi();

    // State we need from redux
    const savedSqlChart = useAppSelector(selectSavedSqlChart);
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
    const queryErrorProjectUuid = useAppSelector(
        (state) => state.sqlRunner.queryErrorProjectUuid,
    );
    const editorHighlightError = useAppSelector(
        (state) => state.sqlRunner.editorHighlightError,
    );
    const warehouseConnectionType = useAppSelector(
        (state) => state.sqlRunner.warehouseConnectionType,
    );
    // So we can dispatch to redux
    const dispatch = useAppDispatch();
    // The in-flight SQL run, so Cancel can abort it
    const runPromiseRef = useRef<{ abort: () => void } | null>(null);
    const lastFailedRun = useRef<
        | { kind: 'sql'; args: Parameters<typeof runSqlQuery>[0] }
        | { kind: 'visualization'; projectUuid: string }
        | null
    >(null);

    useEffect(
        () =>
            addAutomaticPivotFailureListener(
                startAppListening,
                projectUuid,
                () => {
                    lastFailedRun.current = {
                        kind: 'visualization',
                        projectUuid,
                    };
                },
            ),
        [projectUuid],
    );

    // Resolved palette from the org → project → space → dashboard cascade.
    // Falls back to org-level colors for brand-new (unsaved) SQL charts where
    // no SqlChart has been loaded yet.
    const { data: organization } = useOrganization();
    const chartColors =
        savedSqlChart?.resolvedColorPalette.colors ?? organization?.chartColors;
    const { health } = useApp();

    // State tracked by this component
    const [panelSizes, setPanelSizes] = useState<SplitterPaneSize[]>([60, 40]);

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
        (key: string, value: string | number | string[] | number[] | null) => {
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
    const hasQueryResults = useMemo(() => !!queryResults, [queryResults]);

    const handleRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse || !limit) return;

            if (
                activeEditorTab === EditorTabs.VISUALIZATION &&
                hasQueryResults
            ) {
                // Already have results, just refresh pivot data
                const result = await dispatch(
                    prepareAndFetchChartData({ forceRefresh: true }),
                );
                lastFailedRun.current = prepareAndFetchChartData.rejected.match(
                    result,
                )
                    ? { kind: 'visualization', projectUuid }
                    : null;
            } else {
                const args = {
                    sql: sqlToUse,
                    limit,
                    projectUuid,
                    parameterValues,
                };
                const promise = dispatch(runSqlQuery(args));
                runPromiseRef.current = promise;
                const result = await promise;
                runPromiseRef.current = null;
                lastFailedRun.current =
                    runSqlQuery.rejected.match(result) && !result.meta.aborted
                        ? { kind: 'sql', args }
                        : null;

                // If we're on viz tab, also fetch chart data after SQL completes
                if (
                    activeEditorTab === EditorTabs.VISUALIZATION &&
                    runSqlQuery.fulfilled.match(result)
                ) {
                    const vizResult = await dispatch(
                        prepareAndFetchChartData({ forceRefresh: true }),
                    );
                    lastFailedRun.current =
                        prepareAndFetchChartData.rejected.match(vizResult)
                            ? { kind: 'visualization', projectUuid }
                            : null;
                }
            }
        },
        [
            activeEditorTab,
            dispatch,
            projectUuid,
            limit,
            parameterValues,
            hasQueryResults,
        ],
    );

    useEffect(() => {
        const retryFailedRun = (event: Event) => {
            const failedRun = lastFailedRun.current;
            if (
                !(event instanceof CustomEvent) ||
                event.detail !== projectUuid ||
                !failedRun ||
                (failedRun.kind === 'sql'
                    ? failedRun.args.projectUuid !== projectUuid
                    : failedRun.projectUuid !== projectUuid)
            )
                return;
            lastFailedRun.current = null;
            if (failedRun.kind === 'sql') {
                void dispatch(runSqlQuery(failedRun.args));
            } else {
                void dispatch(prepareAndFetchChartData({ forceRefresh: true }));
            }
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, retryFailedRun);
        return () =>
            window.removeEventListener(
                SHARED_SIGN_IN_RECONNECTED,
                retryFailedRun,
            );
    }, [dispatch, projectUuid]);

    useQueryErrorToast(queryError, queryErrorProjectUuid);

    const handleCancelQuery = useCallback(() => {
        runPromiseRef.current?.abort();
    }, []);
    const handleRevealError = useCallback(
        (position: MonacoHighlightChar) => {
            dispatch(setActiveEditorTab(EditorTabs.SQL));
            dispatch(requestEditorReveal(position));
        },
        [dispatch],
    );

    const handleFormatSql = useCallback(() => {
        if (!sql) return;
        dispatch(setSql(formatSql(sql, warehouseConnectionType)));
    }, [sql, warehouseConnectionType, dispatch]);

    // Run query on cmd + enter
    useHotkeys([
        [
            'mod + enter',
            () => void handleRunQuery(sql),
            { preventDefault: true },
        ],
    ]);

    const warehouseConnectionUuid = useAppSelector(selectConnectionUuid);
    useRunQueryOnLoad({ runQuery: handleRunQuery, hasQueryResults });

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

    const maxColumnLimit = useMemo(
        () => health.data?.pivotTable.maxColumnLimit,
        [health],
    );
    const hasReachedPivotColumnLimit = useMemo(
        () =>
            pivotedChartInfo?.data?.columnCount &&
            maxColumnLimit &&
            pivotedChartInfo.data.columnCount > maxColumnLimit,
        [pivotedChartInfo, maxColumnLimit],
    );

    useEffect(() => {
        if (queryResults && panelSizes[1] === 0) {
            setPanelSizes([50, 50]);
        }
    }, [queryResults, panelSizes]);

    const defaultQueryLimit = useMemo(() => {
        return health.data?.query.defaultLimit ?? DEFAULT_SQL_LIMIT;
    }, [health]);

    const resultsSummary = useMemo(() => {
        if (!queryResults) return '';
        const parts = [
            `${queryResults.results.length.toLocaleString()} rows${
                showLimitText ? `, limited to ${defaultQueryLimit}` : ''
            }`,
        ];
        if (queryResults.durationMs !== null) {
            parts.push(
                queryResults.durationMs < 1000
                    ? `${Math.round(queryResults.durationMs)}ms`
                    : `${(queryResults.durationMs / 1000).toFixed(1)}s`,
            );
        }
        return parts.join(' · ');
    }, [queryResults, showLimitText, defaultQueryLimit]);

    const resultsColumnTypes = useMemo(
        () =>
            Object.fromEntries(
                (queryResults?.columns ?? []).flatMap((column) =>
                    column.type ? [[column.reference, column.type]] : [],
                ),
            ),
        [queryResults],
    );

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
                    getFirstIndexColumns(pivotedChartInfo.data?.indexColumn)
                        ?.reference !== col
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
                return executeSqlDownloadQuery(lightdashApi, {
                    projectUuid,
                    sql,
                    limit: downloadLimit,
                    parameterValues,
                    warehouseConnectionUuid,
                });
            }
            return queryUuid;
        },
        [
            sql,
            projectUuid,
            limit,
            queryUuid,
            parameterValues,
            warehouseConnectionUuid,
            lightdashApi,
        ],
    );

    const getDownloadPivotQueryUuid = useCallback(async () => {
        if (!pivotedChartInfo?.data?.queryUuid) {
            throw new Error('No query uuid to download');
        }
        return pivotedChartInfo?.data?.queryUuid;
    }, [pivotedChartInfo]);

    const {
        data: projectParameters,
        isLoading: isProjectParametersLoading,
        isError: isProjectParametersError,
    } = useParameters(projectUuid, Array.from(parameterReferences ?? []));

    return (
        <Stack gap={0} className={styles.root}>
            <Tooltip.Group>
                <ResizableSplitter
                    orientation="vertical"
                    sizes={hideResultsPanel ? [100, 0] : panelSizes}
                    onSizeChange={setPanelSizes}
                    resizable={!hideResultsPanel}
                    lineSize={9}
                    handleColor="transparent"
                    classNames={{ handle: styles.resizeHandle }}
                    styles={{
                        handle: {
                            display: hideResultsPanel ? 'none' : undefined,
                        },
                    }}
                >
                    <ResizableSplitter.Pane
                        id="sql-runner-panel-sql-or-charts"
                        defaultSize={60}
                        min={30}
                        className={styles.panel}
                    >
                        <Box className={styles.pane}>
                            <Box className={styles.paneHeader}>
                                <Group justify="space-between">
                                    <Indicator
                                        color="red.6"
                                        offset={10}
                                        disabled={
                                            !hasErrors || mode === 'virtualView'
                                        }
                                    >
                                        <SegmentedControl
                                            display={
                                                mode === 'virtualView'
                                                    ? 'none'
                                                    : undefined
                                            }
                                            size="xs"
                                            data={[
                                                {
                                                    value: EditorTabs.SQL,
                                                    label: (
                                                        <Tooltip
                                                            disabled={
                                                                !hasUnrunChanges
                                                            }
                                                            label="You haven't run this query yet."
                                                        >
                                                            <Group
                                                                gap={4}
                                                                wrap="nowrap"
                                                            >
                                                                <MantineIcon
                                                                    color="dimmed"
                                                                    icon={
                                                                        IconCode
                                                                    }
                                                                />
                                                                <Text fz="sm">
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
                                                            label="Run a query to see the chart"
                                                        >
                                                            <Group
                                                                gap={4}
                                                                wrap="nowrap"
                                                            >
                                                                <MantineIcon
                                                                    color="dimmed"
                                                                    icon={
                                                                        IconChartHistogram
                                                                    }
                                                                />
                                                                <Text fz="sm">
                                                                    Chart
                                                                </Text>
                                                            </Group>
                                                        </Tooltip>
                                                    ),
                                                },
                                            ]}
                                            value={activeEditorTab}
                                            onChange={(value) => {
                                                const editorTab =
                                                    value as EditorTabs;

                                                if (isLoadingSqlQuery) {
                                                    return;
                                                }

                                                if (
                                                    editorTab ===
                                                        EditorTabs.VISUALIZATION &&
                                                    !queryResults?.results
                                                ) {
                                                    return;
                                                }

                                                dispatch(
                                                    setActiveEditorTab(
                                                        editorTab,
                                                    ),
                                                );
                                            }}
                                        />
                                    </Indicator>
                                </Group>
                                <Group gap="xs">
                                    <Parameters
                                        isEditMode={false}
                                        parameters={projectParameters}
                                        parameterValues={parameterValues}
                                        onParameterChange={
                                            handleParameterChange
                                        }
                                        onClearAll={clearAllParameters}
                                        isLoading={isProjectParametersLoading}
                                        isError={isProjectParametersError}
                                    />
                                    {activeEditorTab === EditorTabs.SQL && (
                                        <>
                                            <SqlQueryHistory />
                                            <Tooltip
                                                label="Format SQL"
                                                position="bottom"
                                            >
                                                <ActionIcon
                                                    aria-label="Format SQL"
                                                    onClick={handleFormatSql}
                                                    disabled={!sql}
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            IconIndentIncrease
                                                        }
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </>
                                    )}
                                    {activeEditorTab ===
                                        EditorTabs.VISUALIZATION &&
                                    !isVizTableConfig(currentVizConfig) &&
                                    !isVizBigNumberConfig(currentVizConfig) &&
                                    selectedChartType ? (
                                        <ChartDownload
                                            chartName={savedSqlChart?.name}
                                            echartsInstance={
                                                activeEchartsInstance!
                                            }
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
                                                    isVizTableConfig(
                                                        currentVizConfig,
                                                    )
                                                        ? currentVizConfig
                                                        : undefined
                                                }
                                                totalResults={
                                                    resultsRunner.getRows()
                                                        .length
                                                }
                                                columnOrder={resultsRunner.getColumnNames()}
                                                getDownloadQueryUuid={
                                                    getDownloadQueryUuid
                                                }
                                            />
                                        )
                                    )}
                                    {toolbarActions && (
                                        <>
                                            <Divider
                                                orientation="vertical"
                                                className={
                                                    styles.toolbarDivider
                                                }
                                            />
                                            {toolbarActions}
                                        </>
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
                                </Group>
                            </Box>
                            <Box
                                ref={inputSectionRef}
                                className={styles.paneBody}
                            >
                                <Box
                                    className={styles.editorSurface}
                                    data-scroll={isVizTableConfig(
                                        currentVizConfig,
                                    )}
                                >
                                    <ConditionalVisibility
                                        isVisible={
                                            activeEditorTab === EditorTabs.SQL
                                        }
                                    >
                                        <SqlRunnerEditor
                                            resetHighlightError={() =>
                                                dispatch(
                                                    setEditorHighlightError(
                                                        undefined,
                                                    ),
                                                )
                                            }
                                            onSubmit={(submittedSQL) =>
                                                handleRunQuery(
                                                    submittedSQL ?? '',
                                                )
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
                                                                            <SqlRunnerChart
                                                                                config={
                                                                                    c
                                                                                }
                                                                                spec={pivotedChartInfo?.data?.getChartSpec(
                                                                                    chartColors,
                                                                                )}
                                                                                isLoading={
                                                                                    !!pivotedChartInfo?.loading
                                                                                }
                                                                                error={
                                                                                    pivotedChartInfo?.error
                                                                                }
                                                                                height={
                                                                                    inputSectionHeight
                                                                                }
                                                                                width={
                                                                                    inputSectionWidth
                                                                                }
                                                                                onEchartsReady={(
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
                            </Box>
                        </Box>
                    </ResizableSplitter.Pane>

                    <ResizableSplitter.Pane
                        id="sql-runner-panel-results"
                        defaultSize={40}
                        max={100}
                        hidden={hideResultsPanel}
                        className={`${styles.panel} sentry-block ph-no-capture`}
                    >
                        <Box className={styles.pane}>
                            <Box className={styles.paneHeader}>
                                {isLoadingSqlQuery ? (
                                    <>
                                        <Group gap="xs" wrap="nowrap">
                                            <Loader
                                                size={12}
                                                color="ldGray.9"
                                            />
                                            <Text fz="xs" c="ldGray.7">
                                                Running · <ElapsedTime />
                                            </Text>
                                        </Group>
                                        {runPromiseRef.current && (
                                            <Button
                                                size="xs"
                                                variant="default"
                                                onClick={handleCancelQuery}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <Group gap="sm">
                                        <Title order={6}>Results</Title>
                                        {queryResults?.results && (
                                            <Text fz="xs" c="dimmed">
                                                {resultsSummary}
                                            </Text>
                                        )}
                                    </Group>
                                )}
                            </Box>
                            <Box
                                className={styles.resultsBody}
                                data-running={isLoadingSqlQuery || undefined}
                            >
                                {isLoadingSqlQuery && (
                                    <Box className={styles.runningBar} />
                                )}
                                {queryError && !isLoadingSqlQuery && (
                                    <QueryErrorBlock
                                        message={
                                            queryError.message ??
                                            'Unknown error'
                                        }
                                        position={editorHighlightError}
                                        onReveal={handleRevealError}
                                    />
                                )}
                                {!queryResults?.results &&
                                    (isLoadingSqlQuery ? (
                                        <ResultsSkeleton />
                                    ) : (
                                        !queryError && <EmptyResultsHints />
                                    ))}
                                {queryResults?.results && resultsRunner && (
                                    <Box
                                        className={styles.previousResults}
                                        h="100%"
                                    >
                                        <ConditionalVisibility
                                            isVisible={showSqlResultsTable}
                                        >
                                            <Table
                                                resultsRunner={resultsRunner}
                                                columnsConfig={
                                                    resultsTableConfig?.columns ??
                                                    {}
                                                }
                                                enableJsonViewer
                                                density="compact"
                                                columnTypes={resultsColumnTypes}
                                                flexProps={{
                                                    h: '100%',
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
                                                        {hasReachedPivotColumnLimit &&
                                                            maxColumnLimit && (
                                                                <Group
                                                                    justify="center"
                                                                    gap="xs"
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
                                                                        c="ldGray.7"
                                                                        ta="center"
                                                                    >
                                                                        This
                                                                        query
                                                                        exceeds
                                                                        the
                                                                        maximum
                                                                        number
                                                                        of
                                                                        columns
                                                                        (
                                                                        {
                                                                            maxColumnLimit
                                                                        }
                                                                        ).
                                                                        Showing
                                                                        the
                                                                        first{' '}
                                                                        {
                                                                            maxColumnLimit
                                                                        }{' '}
                                                                        columns.
                                                                    </Text>
                                                                </Group>
                                                            )}
                                                        <ChartDataTable
                                                            columnNames={
                                                                pivotedChartInfo
                                                                    ?.data
                                                                    .tableData
                                                                    ?.columns
                                                            }
                                                            rows={
                                                                pivotedChartInfo
                                                                    ?.data
                                                                    .tableData
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
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </ResizableSplitter.Pane>
                </ResizableSplitter>
            </Tooltip.Group>
        </Stack>
    );
};
