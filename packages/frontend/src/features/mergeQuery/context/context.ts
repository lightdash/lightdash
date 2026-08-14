import {
    type ApiError,
    type Filters,
    type ItemsMap,
    type MergeJoinType,
    type MergeFieldOrigins,
    type MergeQuery,
    type MergeQueryError,
    type MetricQuery,
    type ParametersValuesMap,
    type SavedChartDAO,
} from '@lightdash/common';
import { createContext } from 'react';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';

/** Which part of the merge workflow the sidebar is editing. */
export type MergeFocus = 'a' | 'b' | 'join';

export type MergeQueryBState = {
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
    /** Keep saved-query-only fields intact while the merge is edited. */
    additionalMetrics?: MetricQuery['additionalMetrics'];
    customDimensions?: MetricQuery['customDimensions'];
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
    fieldOrigins: MergeFieldOrigins;
    results: InfiniteQueryResults;
};

export type MergeContextValue = {
    /** True once a second query has been added. */
    isMerging: boolean;
    /** A saved chart in view mode shows its merge; it does not edit it. */
    readOnly: boolean;
    /**
     * The merge arrived with the chart or the link rather than being built
     * here, so it should run without being asked.
     */
    wasRestored: boolean;
    /** Runs a merge, replacing any run already on screen. */
    run: (
        mergeQuery: MergeQuery,
        parameters?: ParametersValuesMap,
        savedChart?: Pick<SavedChartDAO, 'chartConfig' | 'pivotConfig'>,
    ) => void;
    getDownloadQueryUuid: (
        limit: number | null,
        exportPivotedResults?: boolean,
    ) => Promise<string>;
    isRunning: boolean;
    /** Why a merge was refused. Empty when it compiled. */
    runErrors: MergeQueryError[];
    /** Transport or server failure of the last run, if any. */
    runError: ApiError | null;
    /** User parameters referenced by either source query. */
    parameterReferences: string[];
    /** The merged run, or null when none has succeeded yet. */
    mergeResults: MergeResults | null;
    focus: MergeFocus;
    queryB: MergeQueryBState;
    /** Query B's own filters, pushed down into that side's compile. */
    filtersB: Filters;
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
    addQuery: (initialFocus?: MergeFocus) => void;
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
    setFiltersB: (filters: Filters) => void;
};

export const MergeContext = createContext<MergeContextValue | undefined>(
    undefined,
);
