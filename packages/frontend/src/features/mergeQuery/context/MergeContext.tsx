import {
    MergeJoinType,
    type MergeQuery,
    type SavedMergeQuery,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import { useMergeQueryRun } from '../hooks/useMergeQuery';
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
    },
    joinParts: saved.joinKey.map((part) => ({
        fieldA: part.chartFieldId,
        fieldB: part.secondFieldId,
    })),
    joinType: saved.joinType,
    pivotValues: {
        a: saved.secondQuery.pivot ? [] : (saved.postPivot?.values ?? []),
        b: saved.secondQuery.pivot?.values ?? [],
    },
    postPivotIndex: saved.postPivot
        ? saved.joinKey.findIndex(
              (part) => part.name === saved.postPivot?.keyName,
          )
        : null,
});

/**
 * Merge state lives above the explorer page because the field picker and the
 * query strip are siblings: focusing a query row has to re-target the sidebar,
 * and the sidebar cannot reach into the main column to find out which query is
 * being edited.
 */
export const MergeProvider: FC<
    PropsWithChildren<{ savedMerge?: SavedMergeQuery | null }>
> = ({ children, savedMerge }) => {
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
    const [postPivotIndex, setPostPivotIndex] = useState<number | null>(
        restored?.postPivotIndex ?? null,
    );
    const [joinType, setJoinType] = useState<MergeJoinType>(
        restored?.joinType ?? MergeJoinType.FULL,
    );
    const [pivotValues, setPivotValuesState] = useState<
        Record<'a' | 'b', string[]>
    >(restored?.pivotValues ?? { a: [], b: [] });
    const setPivotValues = useCallback(
        (side: 'a' | 'b', values: string[]) =>
            setPivotValuesState((current) => ({ ...current, [side]: values })),
        [],
    );

    const addQuery = useCallback(() => {
        setIsMerging(true);
        setFocus('b');
    }, []);

    const removeQuery = useCallback(() => {
        setIsMerging(false);
        setFocus('a');
        setQueryB(EMPTY_QUERY_B);
        setJoinParts([{ fieldA: null, fieldB: null }]);
        setPostPivotIndex(null);
        setPivotValuesState({ a: [], b: [] });
    }, []);

    const setExploreB = useCallback((exploreName: string | null) => {
        // Fields belong to an explore, so changing it clears what was picked
        // rather than leaving ids that no longer resolve.
        setQueryB({ exploreName, dimensions: [], metrics: [] });
        setJoinParts((current) =>
            current.map((part) => ({ ...part, fieldB: null })),
        );
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
        setPostPivotIndex(null);
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
                            pivotValues,
                            postPivotIndex,
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
        isMerging,
        focus,
        queryB,
        joinParts,
        joinType,
        pivotValues,
        postPivotIndex,
        setSearchParams,
    ]);

    const mergeRun = useMergeQueryRun(projectUuid);
    const started = mergeRun.data?.started ?? null;
    const results = useInfiniteQueryResults(projectUuid, started?.queryUuid);

    const run = useCallback(
        (mergeQuery: MergeQuery) => mergeRun.mutate(mergeQuery),
        [mergeRun],
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
                      results,
                  }
                : null,
        [started, results],
    );

    const value = useMemo(
        () => ({
            isMerging,
            wasRestored: restored !== null,
            run,
            isRunning: mergeRun.isLoading,
            runErrors: mergeRun.data?.errors ?? [],
            mergeResults,
            focus,
            queryB,
            joinParts,
            joinType,
            pivotValues,
            postPivotIndex,
            addQuery,
            removeQuery,
            setFocus,
            setExploreB,
            toggleFieldB,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setJoinType,
            setPivotValues,
            setPostPivotIndex,
        }),
        [
            isMerging,
            restored,
            run,
            mergeRun.isLoading,
            mergeRun.data,
            mergeResults,
            focus,
            queryB,
            joinParts,
            joinType,
            pivotValues,
            postPivotIndex,
            addQuery,
            removeQuery,
            setExploreB,
            toggleFieldB,
            setJoinField,
            addJoinPart,
            removeJoinPart,
            setPivotValues,
        ],
    );

    return (
        <MergeContext.Provider value={value}>{children}</MergeContext.Provider>
    );
};
