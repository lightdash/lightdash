import { MergeJoinType } from '@lightdash/common';
import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import {
    MergeContext,
    type MergeFocus,
    type MergeQueryBState,
} from './context';

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
    const [isMerging, setIsMerging] = useState(false);
    const [focus, setFocus] = useState<MergeFocus>('a');
    const [queryB, setQueryB] = useState<MergeQueryBState>(EMPTY_QUERY_B);
    const [joinFieldA, setJoinFieldA] = useState<string | null>(null);
    const [joinFieldB, setJoinFieldB] = useState<string | null>(null);
    const [joinType, setJoinType] = useState<MergeJoinType>(MergeJoinType.FULL);
    const [pivotValues, setPivotValues] = useState<string[]>([]);

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
