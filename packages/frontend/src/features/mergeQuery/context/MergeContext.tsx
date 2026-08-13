import {
    MergeJoinType,
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
import { useParams, useSearchParams } from 'react-router';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import { executeMergeQuery } from '../hooks/useMergeQuery';
import {
    MergeContext,
    type MergeFocus,
    type MergeJoinPart,
    type MergeQueryBState,
} from './context';
import {
    MERGE_URL_PARAM,
    parseMergeState,
    serializeMergeState,
} from './mergeUrlState';

const EMPTY_QUERY_B: MergeQueryBState = {
    exploreName: null,
    dimensions: [],
    metrics: [],
};

/**
 * Turns a chart's stored merge back into editable state.
 *
 * Without this a saved merged chart opens looking unmerged, and saving it
 * again would drop the merge it arrived with.
 */
const fromSavedMerge = (saved: SavedMergeQuery) => ({
    focus: 'a' as MergeFocus,
    queryB: {
        exploreName: saved.secondQuery.metricQuery.exploreName,
        dimensions: saved.secondQuery.metricQuery.dimensions,
        metrics: saved.secondQuery.metricQuery.metrics,
        additionalMetrics: saved.secondQuery.metricQuery.additionalMetrics,
        customDimensions: saved.secondQuery.metricQuery.customDimensions,
    },
    joinParts: saved.joinKey.map((part) => ({
        fieldA: part.chartFieldId,
        fieldB: part.secondFieldId,
    })),
    joinType: saved.joinType,
    filtersB: saved.secondQuery.metricQuery.filters ?? {},
});

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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    // Restored once, on mount. A link wins over the chart's stored merge, so
    // that sharing a modified merge shows what was shared rather than what was
    // saved.
    const [restored] = useState(
        () =>
            parseMergeState(searchParams.get(MERGE_URL_PARAM)) ??
            (savedMerge ? fromSavedMerge(savedMerge) : null),
    );

    const [isMerging, setIsMerging] = useState(restored !== null);
    const [focus, setFocus] = useState<MergeFocus>(restored?.focus ?? 'a');
    const [queryB, setQueryB] = useState<MergeQueryBState>(
        restored?.queryB ?? EMPTY_QUERY_B,
    );
    const [joinParts, setJoinParts] = useState<MergeJoinPart[]>(
        restored?.joinParts ?? [{ fieldA: null, fieldB: null }],
    );
    const [joinType, setJoinType] = useState<MergeJoinType>(
        restored?.joinType ?? MergeJoinType.FULL,
    );
    const [filtersB, setFiltersB] = useState<Filters>(restored?.filtersB ?? {});
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
        error: ApiError | null;
        parameterReferences: string[];
    }>({
        isRunning: false,
        errors: [],
        started: null,
        error: null,
        parameterReferences: [],
    });

    const addQuery = useCallback(() => {
        setIsMerging(true);
        setFocus('b');
    }, []);

    const removeQuery = useCallback(() => {
        activeRun.current += 1;
        setIsMerging(false);
        setFocus('a');
        setQueryB(EMPTY_QUERY_B);
        setJoinParts([{ fieldA: null, fieldB: null }]);
        setFiltersB({});
        setRunState({
            isRunning: false,
            errors: [],
            started: null,
            error: null,
            parameterReferences: [],
        });
    }, []);

    const setExploreB = useCallback((exploreName: string | null) => {
        // Fields belong to an explore, so changing it clears what was picked
        // rather than leaving ids that no longer resolve.
        setQueryB({ exploreName, dimensions: [], metrics: [] });
        setJoinParts((current) =>
            current.map((part) => ({ ...part, fieldB: null })),
        );
        setFiltersB({});
    }, []);

    const setJoinField = useCallback(
        (index: number, side: 'fieldA' | 'fieldB', fieldId: string | null) => {
            setJoinParts((current) =>
                current.map((part, partIndex) =>
                    partIndex === index ? { ...part, [side]: fieldId } : part,
                ),
            );
        },
        [],
    );

    const addJoinPart = useCallback(() => {
        setJoinParts((current) => [...current, { fieldA: null, fieldB: null }]);
    }, []);

    const removeJoinPart = useCallback((index: number) => {
        setJoinParts((current) =>
            current.length === 1
                ? current
                : current.filter((_, partIndex) => partIndex !== index),
        );
        // A post-pivot names a key part by position, so dropping a part would
        // leave it pointing at a different one.
    }, []);

    const toggleFieldB = useCallback(
        (fieldId: string, isDimension: boolean) => {
            setQueryB((current) => {
                const key = isDimension ? 'dimensions' : 'metrics';
                const selected = current[key];
                return {
                    ...current,
                    [key]: selected.includes(fieldId)
                        ? selected.filter((id) => id !== fieldId)
                        : [...selected, fieldId],
                };
            });
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
                            queryB,
                            joinParts,
                            joinType,
                            filtersB,
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
        queryB,
        joinParts,
        joinType,
        filtersB,
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
                error: null,
                parameterReferences: current.parameterReferences,
            }));
            executeMergeQuery(projectUuid, mergeQuery, parameters, savedChart)
                .then((result) => {
                    if (activeRun.current !== runId) return;
                    setRunState({
                        isRunning: false,
                        errors: result.errors,
                        started: result.started,
                        error: null,
                        parameterReferences: result.parameterReferences,
                    });
                })
                .catch((error: ApiError) => {
                    if (activeRun.current !== runId) return;
                    setRunState((current) => ({
                        isRunning: false,
                        errors: [],
                        started: null,
                        error,
                        parameterReferences: current.parameterReferences,
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
            if (!result.started) {
                throw new Error(
                    result.errors.map((error) => error.message).join(' '),
                );
            }
            return result.started.queryUuid;
        },
        [projectUuid],
    );

    const { started } = runState;
    const results = useInfiniteQueryResults(projectUuid, started?.queryUuid);

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
                      results,
                  }
                : null,
        [started, results],
    );

    const value = useMemo(
        () => ({
            isMerging,
            readOnly,
            wasRestored: restored !== null,
            run,
            getDownloadQueryUuid,
            isRunning: runState.isRunning,
            runErrors: runState.errors,
            runError: runState.error,
            parameterReferences: runState.parameterReferences,
            mergeResults,
            focus,
            queryB,
            joinParts,
            joinType,
            filtersB,
            addQuery,
            removeQuery,
            setFocus,
            setExploreB,
            toggleFieldB,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setJoinType,
            setFiltersB,
        }),
        [
            isMerging,
            readOnly,
            restored,
            run,
            getDownloadQueryUuid,
            runState.isRunning,
            runState.errors,
            runState.error,
            runState.parameterReferences,
            mergeResults,
            focus,
            queryB,
            joinParts,
            joinType,
            filtersB,
            addQuery,
            removeQuery,
            setExploreB,
            toggleFieldB,
            setJoinField,
            addJoinPart,
            removeJoinPart,
        ],
    );

    return (
        <MergeContext.Provider value={value}>{children}</MergeContext.Provider>
    );
};
