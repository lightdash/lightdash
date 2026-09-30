import type {
    ItemsMap,
    MergeFieldOrigins,
    MetricQuery,
    ParametersValuesMap,
    ReadyQueryResultsPage,
    ResultRow,
} from '@lightdash/common';

/**
 * The query results a visualization is built from.
 *
 * This is the structural subset of the frontend's `InfiniteQueryResults` that
 * the chart builders read, so a frontend results object can be passed as-is.
 * Outside the explorer it is built from `ChartData`; the fields travel
 * separately, as the items map.
 */
export type VisualizationResults = Partial<
    Pick<
        ReadyQueryResultsPage,
        'queryUuid' | 'totalResults' | 'metadata' | 'pivotDetails' | 'columns'
    >
> & {
    rows: ResultRow[];
    metricQuery?: MetricQuery;
    /**
     * Whether every row of the result is present. The frontend streams pages
     * and only derives series once it has them all; a headless caller that
     * already holds every row can leave this out (it defaults to true).
     */
    hasFetchedAllRows?: boolean;
    resolvedTimezone?: string;
    /** Where each field came from when the results are a merge. */
    fieldOrigins?: MergeFieldOrigins;
};

/** Inputs shared by every chart builder. */
export type VisualizationContextInput = {
    resultsData: VisualizationResults | undefined;
    itemsMap: ItemsMap | undefined;
    parameters?: ParametersValuesMap;
    resolvedTimezone?: string;
    /** Animate series on first draw; off for dashboards, exports and screenshots. */
    animation?: boolean;
    /**
     * Float tooltips in the document body rather than inside the chart.
     * Off on touch devices, where a body tooltip drifts while dragging to scroll.
     * @see https://github.com/apache/echarts/issues/12776
     */
    tooltipAppendToBody?: boolean;
};
