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

export type MergeEditorSource = {
    id: string;
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
    filters: Filters;
    /** Keep saved-query-only fields intact while the merge is edited. */
    additionalMetrics?: MetricQuery['additionalMetrics'];
    customDimensions?: MetricQuery['customDimensions'];
};

export type MergeFocus =
    | { kind: 'source'; sourceId: string }
    | { kind: 'join' };

/** One part of the join key: the field each source contributes. */
export type MergeJoinPart = {
    fieldIdBySourceId: Record<string, string | null>;
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
    /** Parameter values embedded in this merged run. */
    usedParametersValues: ParametersValuesMap;
    results: InfiniteQueryResults;
    /** Raw rows for the Results tab when the chart run is pivoted. */
    unpivotedResults: InfiniteQueryResults | null;
};

export type MergeContextValue = {
    /** True once another source has been added to the chart query. */
    isMerging: boolean;
    /** A saved chart in view mode shows its merge; it does not edit it. */
    readOnly: boolean;
    /**
     * The merge arrived with the chart or the link rather than being built
     * here, so it should run without being asked. Cleared once that run is
     * refused before execution: from then on it is in the user's hands, like
     * a merge built here.
     */
    wasRestored: boolean;
    /** The restored merge was refused before it could run, so stop waiting for it. */
    refuseRestoredRun: () => void;
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
    /** Why the auxiliary raw-results query was refused. */
    unpivotedRunErrors: MergeQueryError[];
    /** Transport or server failure of the auxiliary raw-results query. */
    unpivotedRunError: ApiError | null;
    /** User parameters referenced by either source query. */
    parameterReferences: string[];
    /** The merged run, or null when none has succeeded yet. */
    mergeResults: MergeResults | null;
    focus: MergeFocus;
    /** Sources owned by the merge; the chart-owned source stays in Explorer. */
    additionalSources: MergeEditorSource[];
    joinParts: MergeJoinPart[];
    joinType: MergeJoinType;
    addSource: (sourceId: string, initialFocus?: MergeFocus) => void;
    removeSource: (sourceId: string) => void;
    setFocus: (focus: MergeFocus) => void;
    setSourceExplore: (sourceId: string, exploreName: string | null) => void;
    toggleSourceField: (
        sourceId: string,
        fieldId: string,
        isDimension: boolean,
    ) => void;
    setJoinField: (
        index: number,
        sourceId: string,
        fieldId: string | null,
    ) => void;
    addJoinPart: () => void;
    removeJoinPart: (index: number) => void;
    setJoinType: (joinType: MergeJoinType) => void;
    setSourceFilters: (sourceId: string, filters: Filters) => void;
};

export const MergeContext = createContext<MergeContextValue | undefined>(
    undefined,
);
