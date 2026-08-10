import { type MergeJoinType } from '@lightdash/common';
import { createContext } from 'react';

/** Which query the field picker is currently editing. */
export type MergeFocus = 'a' | 'b';

export type MergeQueryBState = {
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
};

/** One part of the join key: the field each query contributes. */
export type MergeJoinPart = {
    fieldA: string | null;
    fieldB: string | null;
};

export type MergeContextValue = {
    /** True once a second query has been added. */
    isMerging: boolean;
    focus: MergeFocus;
    queryB: MergeQueryBState;
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
    pivotValues: string[];
    /** Index of the join key part spread into columns after the join, or null. */
    postPivotIndex: number | null;
    addQuery: () => void;
    removeQuery: () => void;
    setFocus: (focus: MergeFocus) => void;
    setExploreB: (exploreName: string | null) => void;
    toggleFieldB: (fieldId: string, isDimension: boolean) => void;
    setJoinField: (
        index: number,
        side: 'fieldA' | 'fieldB',
        fieldId: string | null,
    ) => void;
    addJoinPart: () => void;
    removeJoinPart: (index: number) => void;
    setJoinType: (joinType: MergeJoinType) => void;
    setPivotValues: (values: string[]) => void;
    setPostPivotIndex: (index: number | null) => void;
};

export const MergeContext = createContext<MergeContextValue | undefined>(
    undefined,
);
