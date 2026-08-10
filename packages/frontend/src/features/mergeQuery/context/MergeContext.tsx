import { MergeJoinType } from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useSearchParams } from 'react-router';
import {
    MergeContext,
    type MergeFocus,
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
 * Merge state lives above the explorer page because the field picker and the
 * query strip are siblings: focusing a query row has to re-target the sidebar,
 * and the sidebar cannot reach into the main column to find out which query is
 * being edited.
 */
export const MergeProvider: FC<PropsWithChildren> = ({ children }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    // Restored once, on mount: the relationship survives a refresh and travels
    // in a shared link, like the rest of the explorer's state.
    const [restored] = useState(() =>
        parseMergeState(searchParams.get(MERGE_URL_PARAM)),
    );

    const [isMerging, setIsMerging] = useState(restored !== null);
    const [focus, setFocus] = useState<MergeFocus>(restored?.focus ?? 'a');
    const [queryB, setQueryB] = useState<MergeQueryBState>(
        restored?.queryB ?? EMPTY_QUERY_B,
    );
    const [joinFieldA, setJoinFieldA] = useState<string | null>(
        restored?.joinFieldA ?? null,
    );
    const [joinFieldB, setJoinFieldB] = useState<string | null>(
        restored?.joinFieldB ?? null,
    );
    const [joinType, setJoinType] = useState<MergeJoinType>(
        restored?.joinType ?? MergeJoinType.FULL,
    );
    const [pivotValues, setPivotValues] = useState<string[]>(
        restored?.pivotValues ?? [],
    );

    const addQuery = useCallback(() => {
        setIsMerging(true);
        setFocus('b');
    }, []);

    const removeQuery = useCallback(() => {
        setIsMerging(false);
        setFocus('a');
        setQueryB(EMPTY_QUERY_B);
        setJoinFieldB(null);
        setPivotValues([]);
    }, []);

    const setExploreB = useCallback((exploreName: string | null) => {
        // Fields belong to an explore, so changing it clears what was picked
        // rather than leaving ids that no longer resolve.
        setQueryB({ exploreName, dimensions: [], metrics: [] });
        setJoinFieldB(null);
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
                            joinFieldA,
                            joinFieldB,
                            joinType,
                            pivotValues,
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
        joinFieldA,
        joinFieldB,
        joinType,
        pivotValues,
        setSearchParams,
    ]);

    const value = useMemo(
        () => ({
            isMerging,
            focus,
            queryB,
            joinFieldA,
            joinFieldB,
            joinType,
            pivotValues,
            addQuery,
            removeQuery,
            setFocus,
            setExploreB,
            toggleFieldB,
            setJoinFieldA,
            setJoinFieldB,
            setJoinType,
            setPivotValues,
        }),
        [
            isMerging,
            focus,
            queryB,
            joinFieldA,
            joinFieldB,
            joinType,
            pivotValues,
            addQuery,
            removeQuery,
            setExploreB,
            toggleFieldB,
        ],
    );

    return (
        <MergeContext.Provider value={value}>{children}</MergeContext.Provider>
    );
};
