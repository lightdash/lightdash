import {
    type ItemsMap,
    type MergeJoinType,
    type MergeQuery,
    type MergeQueryError,
    type MetricQuery,
} from '@lightdash/common';
import { createContext } from 'react';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';

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

/**
 * A merged run, in the shape the explorer's results machinery expects.
 *
 * Carried on the merge context rather than held by the strip that starts it,
 * because when a merge is active it *is* the explorer's result: the chart and
 * the results table read it, and neither is a child of the strip.
 */
export type MergeResults = {
    queryUuid: string;
    fields: ItemsMap;
    metricQuery: MetricQuery;
    /** Field ids in the order the merged statement returns them. */
    columnOrder: string[];
    results: InfiniteQueryResults;
};

export type MergeContextValue = {
    /** True once a second query has been added. */
    isMerging: boolean;
    /**
     * The merge arrived with the chart or the link rather than being built
     * here, so it should run without being asked.
     */
    wasRestored: boolean;
    /** Runs a merge, replacing any run already on screen. */
    run: (mergeQuery: MergeQuery) => void;
    isRunning: boolean;
    /** Why a merge was refused. Empty when it compiled. */
    runErrors: MergeQueryError[];
    /** The merged run, or null when none has succeeded yet. */
    mergeResults: MergeResults | null;
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
