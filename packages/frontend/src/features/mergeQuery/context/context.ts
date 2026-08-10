import { type MergeJoinType } from '@lightdash/common';
import { createContext } from 'react';

/** Which query the field picker is currently editing. */
export type MergeFocus = 'a' | 'b';

export type MergeQueryBState = {
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
};

export type MergeContextValue = {
    /** True once a second query has been added. */
    isMerging: boolean;
    focus: MergeFocus;
    queryB: MergeQueryBState;
    joinFieldA: string | null;
    joinFieldB: string | null;
    joinType: MergeJoinType;
    pivotValues: string[];
    addQuery: () => void;
    removeQuery: () => void;
    setFocus: (focus: MergeFocus) => void;
    setExploreB: (exploreName: string | null) => void;
    toggleFieldB: (fieldId: string, isDimension: boolean) => void;
    setJoinFieldA: (fieldId: string | null) => void;
    setJoinFieldB: (fieldId: string | null) => void;
    setJoinType: (joinType: MergeJoinType) => void;
    setPivotValues: (values: string[]) => void;
};

export const MergeContext = createContext<MergeContextValue | undefined>(
    undefined,
);
