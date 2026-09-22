import {
    derivePivotConfigurationFromChart,
    getItemId,
    mergeCalculationReferencePattern,
    MergeJoinType,
    type AdditionalMetric,
    type ApiCompiledMergeQueryResults,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type MergeQuery,
    type MergeTableCalculation,
    type Filters,
    type MergeQueryError,
    type ParametersValuesMap,
    type SavedChartDAO,
    type SavedMergeDefinition,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useSearchParams } from 'react-router';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    emptyMergeSource,
    PRIMARY_SOURCE_ID,
} from '../constants';
import { executeMergeQuery } from '../hooks/useMergeQuery';
import { MergeContext, type MergeFocus, type MergeJoinPart } from './context';
import {
    MERGE_URL_PARAM,
    parseMergeState,
    serializeMergeState,
} from './mergeUrlState';
import { restoreSavedMerge } from './restoreSavedMerge';

/**
 * Merge state lives above the explorer page because the field picker and the
 * query strip are siblings: focusing a query row has to re-target the sidebar,
 * and the sidebar cannot reach into the main column to find out which query is
 * being edited.
 */
export const MergeProvider: FC<
    PropsWithChildren<{
        savedMerge?: SavedMergeDefinition | null;
        /** View mode: show the merge, allow nothing, keep the URL clean. */
        readOnly?: boolean;
    }>
> = ({ children, savedMerge, readOnly = false }) => {
    const projectUuid = useProjectUuid();
    const [searchParams, setSearchParams] = useSearchParams();
    // Restored once, on mount. A link wins over the chart's stored merge, so
    // that sharing a modified merge shows what was shared rather than what was
    // saved.
    const [restored] = useState(
        () =>
            parseMergeState(searchParams.get(MERGE_URL_PARAM)) ??
            (savedMerge ? restoreSavedMerge(savedMerge) : null),
    );
    // A restored merge the rules refuse never runs, so nothing may wait on it.
    const [restoredRunRefused, setRestoredRunRefused] = useState(false);
    const refuseRestoredRun = useCallback(
        () => setRestoredRunRefused(true),
        [],
    );

    const [focus, setFocus] = useState<MergeFocus>(
        restored?.focus ?? {
            kind: 'source',
            sourceId: PRIMARY_SOURCE_ID,
        },
    );
    const [additionalSources, setAdditionalSources] = useState(
        restored?.additionalSources ?? [],
    );
    // Fixed by the saved chart so its merged column ids hold; never edited
    const primarySourceName = restored?.primarySourceName ?? null;
    const [joinParts, setJoinParts] = useState<MergeJoinPart[]>(
        restored?.joinParts ?? [
            {
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: null,
                    [DEFAULT_ADDITIONAL_SOURCE_ID]: null,
                },
            },
        ],
    );
    const [joinType, setJoinType] = useState<MergeJoinType>(
        restored?.joinType ?? MergeJoinType.FULL,
    );
    const [repeatValuesSourceIds, setRepeatValuesSourceIds] = useState<
        string[]
    >(restored?.repeatValuesSourceIds ?? []);
    const [tableCalculations, setTableCalculations] = useState<
        MergeTableCalculation[]
    >(restored?.tableCalculations ?? []);
    const isMerging = additionalSources.length > 0;
    const activeRun = useRef(0);
    const lastRun = useRef<{
        mergeQuery: MergeQuery;
        parameters?: ParametersValuesMap;
        savedChart?: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>;
    } | null>(null);
    const [runState, setRunState] = useState<{
        isRunning: boolean;
        errors: MergeQueryError[];
        started: ApiExecuteAsyncMetricQueryResults | null;
        unpivotedStarted: ApiExecuteAsyncMetricQueryResults | null;
        error: ApiError | null;
        unpivotedErrors: MergeQueryError[];
        unpivotedError: ApiError | null;
        parameterReferences: string[];
        fieldOrigins: ApiCompiledMergeQueryResults['fieldOrigins'];
        /** Internal: the merge behind `started`; gates `mergeResults`. Null until a run succeeds. */
        ranMergeQuery: MergeQuery | null;
        /** Public: the merge last submitted, whether it ran or was refused. */
        lastRunMergeQuery: MergeQuery | null;
    }>({
        isRunning: false,
        errors: [],
        started: null,
        unpivotedStarted: null,
        error: null,
        unpivotedErrors: [],
        unpivotedError: null,
        parameterReferences: [],
        fieldOrigins: {},
        ranMergeQuery: null,
        lastRunMergeQuery: null,
    });

    const addSource = useCallback(
        (
            sourceId: string,
            initialFocus: MergeFocus = { kind: 'source', sourceId },
        ) => {
            if (
                additionalSources.some((source) => source.id === sourceId) ||
                sourceId === PRIMARY_SOURCE_ID
            ) {
                return;
            }
            setAdditionalSources((current) =>
                current.some((source) => source.id === sourceId)
                    ? current
                    : [...current, emptyMergeSource(sourceId)],
            );
            setJoinParts((current) =>
                current.map((part) => ({
                    ...part,
                    fieldIdBySourceId: {
                        ...part.fieldIdBySourceId,
                        [sourceId]: null,
                    },
                })),
            );
            setFocus(initialFocus);
        },
        [additionalSources],
    );

    const removeSource = useCallback(
        (sourceId: string, namesByHandle?: Record<string, string>) => {
            activeRun.current += 1;
            setFocus({ kind: 'source', sourceId: PRIMARY_SOURCE_ID });
            setAdditionalSources((current) =>
                current
                    .filter((source) => source.id !== sourceId)
                    .map((source) =>
                        namesByHandle?.[source.id]
                            ? { ...source, name: namesByHandle[source.id] }
                            : source,
                    ),
            );
            setJoinParts((current) =>
                current.map((part) => {
                    const { [sourceId]: _, ...fieldIdBySourceId } =
                        part.fieldIdBySourceId;
                    return { ...part, fieldIdBySourceId };
                }),
            );
            setRepeatValuesSourceIds((current) =>
                additionalSources.length <= 1
                    ? []
                    : current.filter((id) => id !== sourceId),
            );
            const removedSourceName = namesByHandle?.[sourceId];
            setTableCalculations((current) =>
                additionalSources.length <= 1 || !removedSourceName
                    ? []
                    : current.filter(
                          (calculation) =>
                              !Array.from(
                                  calculation.sql.matchAll(
                                      mergeCalculationReferencePattern,
                                  ),
                              ).some(([, reference]) =>
                                  reference.startsWith(`${removedSourceName}.`),
                              ),
                      ),
            );
            setRunState({
                isRunning: false,
                errors: [],
                started: null,
                unpivotedStarted: null,
                error: null,
                unpivotedErrors: [],
                unpivotedError: null,
                parameterReferences: [],
                fieldOrigins: {},
                ranMergeQuery: null,
                lastRunMergeQuery: null,
            });
        },
        [additionalSources.length],
    );

    const setSourceExplore = useCallback(
        (sourceId: string, exploreName: string | null) => {
            // Fields belong to an explore, so changing it clears what was picked
            // rather than leaving ids that no longer resolve.
            setAdditionalSources((current) =>
                current.map((source) =>
                    source.id === sourceId
                        ? {
                              ...emptyMergeSource(sourceId),
                              exploreName,
                          }
                        : source,
                ),
            );
            setJoinParts((current) =>
                current.map((part) => ({
                    ...part,
                    fieldIdBySourceId: {
                        ...part.fieldIdBySourceId,
                        [sourceId]: null,
                    },
                })),
            );
        },
        [],
    );

    const setJoinField = useCallback(
        (index: number, sourceId: string, fieldId: string | null) => {
            setJoinParts((current) =>
                current.map((part, partIndex) =>
                    partIndex === index
                        ? {
                              ...part,
                              fieldIdBySourceId: {
                                  ...part.fieldIdBySourceId,
                                  [sourceId]: fieldId,
                              },
                          }
                        : part,
                ),
            );
        },
        [],
    );

    const addJoinPart = useCallback(() => {
        setJoinParts((current) => [
            ...current,
            {
                fieldIdBySourceId: Object.fromEntries(
                    [
                        PRIMARY_SOURCE_ID,
                        ...additionalSources.map((source) => source.id),
                    ].map((sourceId) => [sourceId, null]),
                ),
            },
        ]);
    }, [additionalSources]);

    const removeJoinPart = useCallback((index: number) => {
        setJoinParts((current) =>
            current.length === 1
                ? current
                : current.filter((_, partIndex) => partIndex !== index),
        );
        // A post-pivot names a key part by position, so dropping a part would
        // leave it pointing at a different one.
    }, []);

    const toggleSourceField = useCallback(
        (sourceId: string, fieldId: string, isDimension: boolean) => {
            setAdditionalSources((current) =>
                current.map((source) => {
                    if (source.id !== sourceId) return source;
                    const key = isDimension ? 'dimensions' : 'metrics';
                    const selected = source[key];
                    return {
                        ...source,
                        [key]: selected.includes(fieldId)
                            ? selected.filter((id) => id !== fieldId)
                            : [...selected, fieldId],
                    };
                }),
            );
        },
        [],
    );

    const setRepeatValues = useCallback(
        (sourceId: string, repeatValues: boolean) => {
            setRepeatValuesSourceIds((current) =>
                repeatValues
                    ? current.includes(sourceId)
                        ? current
                        : [...current, sourceId]
                    : current.filter((id) => id !== sourceId),
            );
        },
        [],
    );

    const setSourceFilters = useCallback(
        (sourceId: string, filters: Filters) => {
            setAdditionalSources((current) =>
                current.map((source) =>
                    source.id === sourceId ? { ...source, filters } : source,
                ),
            );
        },
        [],
    );

    const addSourceAdditionalMetric = useCallback(
        (sourceId: string, metric: AdditionalMetric) => {
            const metricId = getItemId(metric);
            setAdditionalSources((current) =>
                current.map((source) => {
                    if (source.id !== sourceId) return source;
                    const additionalMetrics = source.additionalMetrics ?? [];
                    return {
                        ...source,
                        additionalMetrics: additionalMetrics.some(
                            (candidate) => getItemId(candidate) === metricId,
                        )
                            ? additionalMetrics
                            : [...additionalMetrics, metric],
                        metrics: source.metrics.includes(metricId)
                            ? source.metrics
                            : [...source.metrics, metricId],
                    };
                }),
            );
        },
        [],
    );

    const addTableCalculation = useCallback(
        (calculation: MergeTableCalculation) => {
            setTableCalculations((current) => [...current, calculation]);
        },
        [],
    );

    const updateTableCalculation = useCallback(
        (oldName: string, calculation: MergeTableCalculation) => {
            setTableCalculations((current) =>
                current.map((candidate) =>
                    candidate.name === oldName ? calculation : candidate,
                ),
            );
        },
        [],
    );

    const removeTableCalculation = useCallback((name: string) => {
        setTableCalculations((current) =>
            current.filter((calculation) => calculation.name !== name),
        );
    }, []);

    // Mirror the relationship into the URL. Replace rather than push, so
    // building a merge does not fill the back button with every keystroke.
    useEffect(() => {
        // The URL carries a merge so a *modified* one can be shared. A saved
        // chart in view mode is not being modified; its merge lives in the
        // chart, and echoing it into the URL says otherwise.
        if (readOnly) return;
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (isMerging) {
                    next.set(
                        MERGE_URL_PARAM,
                        serializeMergeState({
                            focus,
                            primarySourceName,
                            additionalSources,
                            joinParts,
                            joinType,
                            repeatValuesSourceIds,
                            tableCalculations,
                        }),
                    );
                } else {
                    next.delete(MERGE_URL_PARAM);
                }
                return next;
            },
            { replace: true },
        );
    }, [
        readOnly,
        isMerging,
        focus,
        additionalSources,
        primarySourceName,
        joinParts,
        joinType,
        repeatValuesSourceIds,
        tableCalculations,
        setSearchParams,
    ]);

    useEffect(
        () => () => {
            activeRun.current += 1;
        },
        [],
    );

    const run = useCallback(
        (
            mergeQuery: MergeQuery,
            parameters?: ParametersValuesMap,
            savedChart?: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
        ) => {
            if (!projectUuid) return;
            lastRun.current = { mergeQuery, parameters, savedChart };
            const runId = activeRun.current + 1;
            activeRun.current = runId;
            setRunState((current) => ({
                isRunning: true,
                errors: [],
                started: null,
                unpivotedStarted: null,
                error: null,
                unpivotedErrors: [],
                unpivotedError: null,
                parameterReferences: current.parameterReferences,
                fieldOrigins: current.fieldOrigins,
                ranMergeQuery: null,
                lastRunMergeQuery: mergeQuery,
            }));
            executeMergeQuery(projectUuid, mergeQuery, parameters, savedChart)
                .then(async (result) => {
                    if (activeRun.current !== runId) return;
                    if (result.outcome === 'refused') {
                        setRunState({
                            isRunning: false,
                            errors: result.errors,
                            started: null,
                            unpivotedStarted: null,
                            error: null,
                            unpivotedErrors: [],
                            unpivotedError: null,
                            parameterReferences: result.parameterReferences,
                            fieldOrigins: result.fieldOrigins,
                            ranMergeQuery: null,
                            lastRunMergeQuery: mergeQuery,
                        });
                    } else {
                        const pivotConfiguration = savedChart
                            ? derivePivotConfigurationFromChart(
                                  savedChart,
                                  result.query.metricQuery,
                                  result.query.fields,
                              )
                            : undefined;
                        let unpivoted = null;
                        if (pivotConfiguration) {
                            try {
                                unpivoted = await executeMergeQuery(
                                    projectUuid,
                                    mergeQuery,
                                    parameters,
                                );
                            } catch (error) {
                                if (activeRun.current !== runId) return;
                                setRunState({
                                    isRunning: false,
                                    errors: [],
                                    started: result.query,
                                    unpivotedStarted: null,
                                    error: null,
                                    unpivotedErrors: [],
                                    unpivotedError: error as ApiError,
                                    parameterReferences:
                                        result.parameterReferences,
                                    fieldOrigins: result.fieldOrigins,
                                    ranMergeQuery: mergeQuery,
                                    lastRunMergeQuery: mergeQuery,
                                });
                                return;
                            }
                        }
                        if (activeRun.current !== runId) return;
                        if (unpivoted?.outcome === 'refused') {
                            setRunState({
                                isRunning: false,
                                errors: [],
                                started: result.query,
                                unpivotedStarted: null,
                                error: null,
                                unpivotedErrors: unpivoted.errors,
                                unpivotedError: null,
                                parameterReferences: result.parameterReferences,
                                fieldOrigins: result.fieldOrigins,
                                ranMergeQuery: mergeQuery,
                                lastRunMergeQuery: mergeQuery,
                            });
                            return;
                        }
                        setRunState({
                            isRunning: false,
                            errors: [],
                            started: result.query,
                            unpivotedStarted: unpivoted?.query ?? null,
                            error: null,
                            unpivotedErrors: [],
                            unpivotedError: null,
                            parameterReferences: result.parameterReferences,
                            fieldOrigins: result.fieldOrigins,
                            ranMergeQuery: mergeQuery,
                            lastRunMergeQuery: mergeQuery,
                        });
                    }
                })
                .catch((error: ApiError) => {
                    if (activeRun.current !== runId) return;
                    setRunState((current) => ({
                        isRunning: false,
                        errors: [],
                        started: null,
                        unpivotedStarted: null,
                        error,
                        unpivotedErrors: [],
                        unpivotedError: null,
                        parameterReferences: current.parameterReferences,
                        fieldOrigins: current.fieldOrigins,
                        ranMergeQuery: null,
                        lastRunMergeQuery: mergeQuery,
                    }));
                });
        },
        [projectUuid],
    );

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null, exportPivotedResults = false) => {
            if (!projectUuid || !lastRun.current) {
                throw new Error('Missing merged query');
            }
            const { mergeQuery, parameters, savedChart } = lastRun.current;
            const result = await executeMergeQuery(
                projectUuid,
                mergeQuery,
                parameters,
                exportPivotedResults ? savedChart : undefined,
                limit,
            );
            if (result.outcome === 'refused') {
                throw new Error(
                    result.errors.map((error) => error.message).join(' '),
                );
            }
            return result.query.queryUuid;
        },
        [projectUuid],
    );

    const { started, unpivotedStarted } = runState;
    const results = useInfiniteQueryResults(projectUuid, started?.queryUuid);
    const unpivotedResults = useInfiniteQueryResults(
        projectUuid,
        unpivotedStarted?.queryUuid,
    );

    const mergeResults = useMemo(
        () =>
            started && runState.ranMergeQuery
                ? {
                      queryUuid: started.queryUuid,
                      mergeQuery: runState.ranMergeQuery,
                      fields: started.fields,
                      metricQuery: started.metricQuery,
                      // The metric query lists dimensions before metrics; the
                      // statement returns join keys, then values, then
                      // calculations. Column order follows the statement.
                      columnOrder: [
                          ...started.metricQuery.dimensions,
                          ...started.metricQuery.metrics,
                      ],
                      fieldOrigins: runState.fieldOrigins,
                      usedParametersValues: started.usedParametersValues,
                      results,
                      unpivotedResults: unpivotedStarted
                          ? unpivotedResults
                          : null,
                  }
                : null,
        [
            started,
            unpivotedStarted,
            results,
            unpivotedResults,
            runState.fieldOrigins,
            runState.ranMergeQuery,
        ],
    );

    const value = useMemo(
        () => ({
            isMerging,
            readOnly,
            wasRestored: restored !== null && !restoredRunRefused,
            refuseRestoredRun,
            run,
            getDownloadQueryUuid,
            isRunning: runState.isRunning,
            runErrors: runState.errors,
            runError: runState.error,
            unpivotedRunErrors: runState.unpivotedErrors,
            unpivotedRunError: runState.unpivotedError,
            parameterReferences: runState.parameterReferences,
            mergeResults,
            replacesQuery:
                (restored !== null && !restoredRunRefused) ||
                runState.isRunning ||
                runState.started !== null ||
                runState.error !== null ||
                runState.errors.length > 0,
            lastRunMergeQuery: runState.lastRunMergeQuery,
            focus,
            additionalSources,
            primarySourceName,
            joinParts,
            joinType,
            repeatValuesSourceIds,
            tableCalculations,
            addSource,
            removeSource,
            setFocus,
            setSourceExplore,
            toggleSourceField,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setJoinType,
            setRepeatValues,
            setSourceFilters,
            addSourceAdditionalMetric,
            addTableCalculation,
            updateTableCalculation,
            removeTableCalculation,
        }),
        [
            isMerging,
            readOnly,
            restored,
            restoredRunRefused,
            refuseRestoredRun,
            run,
            getDownloadQueryUuid,
            runState.isRunning,
            runState.started,
            runState.errors,
            runState.error,
            runState.unpivotedErrors,
            runState.unpivotedError,
            runState.parameterReferences,
            mergeResults,
            runState.lastRunMergeQuery,
            focus,
            additionalSources,
            primarySourceName,
            joinParts,
            joinType,
            repeatValuesSourceIds,
            tableCalculations,
            addSource,
            removeSource,
            setSourceExplore,
            toggleSourceField,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setRepeatValues,
            setSourceFilters,
            addSourceAdditionalMetric,
            addTableCalculation,
            updateTableCalculation,
            removeTableCalculation,
        ],
    );

    return (
        <MergeContext.Provider value={value}>{children}</MergeContext.Provider>
    );
};
