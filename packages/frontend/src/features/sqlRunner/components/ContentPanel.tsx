import {
    ChartType,
    formatSql,
    getParameterReferences,
    type ApiErrorDetail,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    CopyButton,
    Divider,
    Group,
    Kbd,
    Loader,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
    Title,
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
import { useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import ChartDownloadMenu from '../../../components/common/ChartDownload/ChartDownloadMenu';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import LightdashVisualization from '../../../components/LightdashVisualization';
import { QueryCostConfirmModal } from '../../../components/QueryCostEstimate/QueryCostConfirmModal';
import { QueryCostEstimateBadge } from '../../../components/QueryCostEstimate/QueryCostEstimateBadge';
import RunSqlQueryButton from '../../../components/SqlRunner/RunSqlQueryButton';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    fetchSqlQueryCostEstimate,
    useQueryCostEstimateSettings,
    useSqlQueryCostEstimate,
} from '../../../hooks/useQueryCostEstimate';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import useApp from '../../../providers/App/useApp';
import { Parameters, useParameters } from '../../parameters';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useRunQueryOnLoad } from '../hooks/useRunQueryOnLoad';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    clearParameterValues,
    EditorTabs,
    requestEditorReveal,
    selectActiveEditorTab,
    selectChartConfig,
    selectConnectionUuid,
    selectLimit,
    selectParameterValues,
    selectProjectUuid,
    selectQueryUuid,
    selectSavedChart,
    selectSql,
    selectSqlQueryResults,
    setActiveEditorTab,
    setEditorHighlightError,
    setSql,
    setSqlLimit,
    updateParameterValue,
} from '../store/sqlRunnerSlice';
import { runSqlQuery } from '../store/thunks';
import { executeSqlDownloadQuery } from '../utils/executeSqlDownloadQuery';
import { useSqlRunnerPivotConfiguration } from '../viz/useSqlRunnerPivotConfiguration';
import styles from './ContentPanel.module.css';
import ResultsDownloadButton from './Download/ResultsDownloadButton';
import { type MonacoHighlightChar } from './SqlEditor';
import { SqlQueryHistory } from './SqlQueryHistory';
import { SqlResultsTable } from './SqlResultsTable/SqlResultsTable';
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

/**
 * The editor and its results. The Chart tab draws the last run through the
 * classic chart stack from the `SqlRunnerVisualizationProvider` the page
 * mounts; the results pane always shows the rows as the warehouse returned
 * them.
 */
export const ContentPanel: FC<{ toolbarActions?: ReactNode }> = ({
    toolbarActions,
}) => {
    const savedChart = useAppSelector(selectSavedChart);
    const projectUuid = useAppSelector(selectProjectUuid);
    const sql = useAppSelector(selectSql);
    const queryUuid = useAppSelector(selectQueryUuid);
    const chartConfig = useAppSelector(selectChartConfig);
    const activeEditorTab = useAppSelector(selectActiveEditorTab);
    const limit = useAppSelector(selectLimit);
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
    const dispatch = useAppDispatch();
    // The in-flight SQL run, so Cancel can abort it
    const runPromiseRef = useRef<{ abort: () => void } | null>(null);
    const lastFailedRun = useRef<Parameters<typeof runSqlQuery>[0] | null>(
        null,
    );

    const { health } = useApp();

    const [panelSizes, setPanelSizes] = useState<SplitterPaneSize[]>([60, 40]);

    const mode = useAppSelector((state) => state.sqlRunner.mode);

    const { ref: inputSectionRef, height: inputSectionHeight } =
        useElementSize();

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

    const isChartTab = activeEditorTab === EditorTabs.VISUALIZATION;
    const isTableChart = chartConfig.type === ChartType.TABLE;
    // A table chart is the results, so the results pane would repeat it
    const hideResultsPanel = isChartTab && isTableChart;

    const queryResults = useAppSelector(selectSqlQueryResults);
    const hasQueryResults = !!queryResults;

    const warehouseConnectionUuid = useAppSelector(selectConnectionUuid);
    const queryClient = useQueryClient();
    const costEstimateSettings = useQueryCostEstimateSettings(projectUuid);
    const [pendingCostConfirmation, setPendingCostConfirmation] = useState<{
        sql: string;
        totalBytesProcessed: number;
        confirmEstimatedBytesAbove: number;
    } | null>(null);
    const costEstimateBody = useMemo(
        () =>
            sql && limit
                ? {
                      sql,
                      limit,
                      parameters: parameterValues,
                      warehouseConnectionUuid:
                          warehouseConnectionUuid ?? undefined,
                  }
                : null,
        [sql, limit, parameterValues, warehouseConnectionUuid],
    );
    const costEstimate = useSqlQueryCostEstimate(
        projectUuid,
        costEstimateBody,
        costEstimateSettings !== null,
    );

    // A run on the Chart tab re-runs the statement; a grouped chart's pivot
    // follows the new run on its own
    const executeRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse || !limit) return;
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
                    ? args
                    : null;
        },
        [dispatch, projectUuid, limit, parameterValues],
    );

    // Above the connection's threshold, ask before running; a failed
    // estimate never blocks, since maximum bytes billed is the backstop.
    const handleRunQuery = useCallback(
        async (sqlToUse: string) => {
            if (!sqlToUse || !limit) return;
            if (costEstimateSettings?.confirmEstimatedBytesAbove) {
                try {
                    const estimate = await fetchSqlQueryCostEstimate(
                        queryClient,
                        projectUuid,
                        {
                            sql: sqlToUse,
                            limit,
                            parameters: parameterValues,
                            warehouseConnectionUuid:
                                warehouseConnectionUuid ?? undefined,
                        },
                    );
                    if (
                        estimate.status === 'estimated' &&
                        estimate.requiresConfirmation &&
                        estimate.confirmEstimatedBytesAbove !== null
                    ) {
                        setPendingCostConfirmation({
                            sql: sqlToUse,
                            totalBytesProcessed: estimate.totalBytesProcessed,
                            confirmEstimatedBytesAbove:
                                estimate.confirmEstimatedBytesAbove,
                        });
                        return;
                    }
                } catch {
                    // Fall through and run the query.
                }
            }
            await executeRunQuery(sqlToUse);
        },
        [
            costEstimateSettings,
            executeRunQuery,
            limit,
            parameterValues,
            projectUuid,
            queryClient,
            warehouseConnectionUuid,
        ],
    );

    useEffect(() => {
        const retryFailedRun = (event: Event) => {
            const failedRun = lastFailedRun.current;
            if (
                !(event instanceof CustomEvent) ||
                event.detail !== projectUuid ||
                !failedRun ||
                failedRun.projectUuid !== projectUuid
            )
                return;
            lastFailedRun.current = null;
            void dispatch(runSqlQuery(failedRun));
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

    useRunQueryOnLoad({ runQuery: handleRunQuery, hasQueryResults });

    const showLimitText = useMemo(() => {
        return (
            queryResults?.results &&
            activeEditorTab === EditorTabs.SQL &&
            queryResults.results.length >= DEFAULT_SQL_LIMIT
        );
    }, [queryResults, activeEditorTab]);

    const canSetSqlLimit = isChartTab;

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

    const resultsColumnNames = useMemo(
        () => Object.keys(queryResults?.columns ?? {}),
        [queryResults],
    );
    const resultsColumnTypes = useMemo(
        () =>
            Object.fromEntries(
                Object.values(queryResults?.columns ?? {}).map((column) => [
                    column.reference,
                    column.type,
                ]),
            ),
        [queryResults],
    );

    useEffect(() => {
        if (!limit) {
            dispatch(setSqlLimit(defaultQueryLimit));
        }
    }, [defaultQueryLimit, dispatch, limit]);

    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );

    const { pivotConfiguration } = useSqlRunnerPivotConfiguration();

    const getDownloadQueryUuid = useCallback(
        async (downloadLimit: number | null) => {
            // Always execute a new query if:
            // 1. limit is null (meaning "all results" - should ignore existing query limits)
            // 2. limit is different from current query
            // 3. there is no fallback query uuid (in theory, never happens)
            if (!queryUuid || limit === null || limit !== downloadLimit) {
                return executeSqlDownloadQuery({
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
        ],
    );

    // A chart export re-runs the statement at the export limit, pivoted
    // the way the chart is when the pivoted rows are asked for
    const getChartDownloadQueryUuid = useCallback(
        async (downloadLimit: number | null, exportPivotedResults?: boolean) =>
            executeSqlDownloadQuery({
                projectUuid,
                sql,
                limit: downloadLimit,
                parameterValues,
                warehouseConnectionUuid,
                ...(exportPivotedResults && pivotConfiguration
                    ? { pivotConfiguration }
                    : {}),
            }),
        [
            projectUuid,
            sql,
            parameterValues,
            warehouseConnectionUuid,
            pivotConfiguration,
        ],
    );

    const {
        data: projectParameters,
        isLoading: isProjectParametersLoading,
        isError: isProjectParametersError,
    } = useParameters(projectUuid, Array.from(parameterReferences ?? []));

    return (
        <Stack gap={0} className={styles.root}>
            {pendingCostConfirmation && (
                <QueryCostConfirmModal
                    opened
                    totalBytesProcessed={
                        pendingCostConfirmation.totalBytesProcessed
                    }
                    confirmEstimatedBytesAbove={
                        pendingCostConfirmation.confirmEstimatedBytesAbove
                    }
                    onConfirm={() => {
                        setPendingCostConfirmation(null);
                        void executeRunQuery(pendingCostConfirmation.sql);
                    }}
                    onClose={() => setPendingCostConfirmation(null)}
                />
            )}
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
                                                                icon={IconCode}
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
                                                setActiveEditorTab(editorTab),
                                            );
                                        }}
                                    />
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
                                    {isChartTab && !isTableChart ? (
                                        <ChartDownloadMenu
                                            projectUuid={projectUuid}
                                            chartName={savedChart?.name}
                                            getDownloadQueryUuid={
                                                getChartDownloadQueryUuid
                                            }
                                        />
                                    ) : (
                                        mode === 'default' && (
                                            <ResultsDownloadButton
                                                projectUuid={projectUuid}
                                                disabled={isLoadingSqlQuery}
                                                chartName={savedChart?.name}
                                                totalResults={
                                                    queryResults?.results
                                                        .length ?? 0
                                                }
                                                columnOrder={resultsColumnNames}
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
                                    {costEstimateSettings !== null && (
                                        <QueryCostEstimateBadge
                                            estimate={costEstimate.data}
                                            isFetching={costEstimate.isFetching}
                                        />
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
                                    data-scroll={isChartTab && isTableChart}
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

                                    {isChartTab && queryResults?.results && (
                                        <Box
                                            flex={1}
                                            mih={0}
                                            h={inputSectionHeight}
                                            px="sm"
                                            pb="sm"
                                        >
                                            <LightdashVisualization
                                                className="sentry-block ph-no-capture"
                                                data-testid="sql-runner-visualization"
                                                enableContextMenu={false}
                                            />
                                        </Box>
                                    )}
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
                                {queryResults?.results && (
                                    <Box
                                        className={styles.previousResults}
                                        h="100%"
                                    >
                                        <SqlResultsTable
                                            rows={queryResults.results}
                                            columns={resultsColumnNames}
                                            enableJsonViewer
                                            density="compact"
                                            columnTypes={resultsColumnTypes}
                                            flexProps={{
                                                h: '100%',
                                            }}
                                        />
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
