import {
    derivePivotConfigurationFromChart,
    MergeJoinType,
    type ApiCompiledMergeQueryResults,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type MergeQuery,
    type Filters,
    type MergeQueryError,
    type ParametersValuesMap,
    type SavedChartDAO,
    type SavedMergeQuery,
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
    MAX_MERGE_SOURCES,
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
        savedMerge?: SavedMergeQuery | null;
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
    });

    const addSource = useCallback(
        (
            sourceId: string,
            initialFocus: MergeFocus = { kind: 'source', sourceId },
        ) => {
            if (
                additionalSources.some((source) => source.id === sourceId) ||
                additionalSources.length + 1 >= MAX_MERGE_SOURCES
            ) {
                return;
            }
            setAdditionalSources((current) => [
                ...current,
                emptyMergeSource(sourceId),
            ]);
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

    const removeSource = useCallback((sourceId: string) => {
        activeRun.current += 1;
        setFocus({ kind: 'source', sourceId: PRIMARY_SOURCE_ID });
        setAdditionalSources((current) =>
            current.filter((source) => source.id !== sourceId),
        );
        setJoinParts((current) =>
            current.map((part) => {
                const { [sourceId]: _, ...fieldIdBySourceId } =
                    part.fieldIdBySourceId;
                return { fieldIdBySourceId };
            }),
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
        });
    }, []);

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
                            additionalSources,
                            joinParts,
                            joinType,
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
        joinParts,
        joinType,
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
            started
                ? {
                      queryUuid: started.queryUuid,
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
            focus,
            additionalSources,
            joinParts,
            joinType,
            addSource,
            removeSource,
            setFocus,
            setSourceExplore,
            toggleSourceField,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setJoinType,
            setSourceFilters,
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
            runState.errors,
            runState.error,
            runState.unpivotedErrors,
            runState.unpivotedError,
            runState.parameterReferences,
            mergeResults,
            focus,
            additionalSources,
            joinParts,
            joinType,
            addSource,
            removeSource,
            setSourceExplore,
            toggleSourceField,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setSourceFilters,
        ],
    );

    return (
        <MergeContext.Provider value={value}>{children}</MergeContext.Provider>
    );
};
