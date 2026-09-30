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
 * A headless caller (a data app, a server-side render) fills it from the
 * query API: `rows` and `fields` at least, `pivotDetails` when the query was
 * pivoted, `metricQuery` for sorts and table calculations.
 */
export type VisualizationResults = Partial<
    Pick<
        ReadyQueryResultsPage,
        'queryUuid' | 'totalResults' | 'metadata' | 'pivotDetails' | 'columns'
    >
> & {
    rows: ResultRow[];
    /** The items (dimensions, metrics, table calculations) the rows are keyed by. */
    fields?: ItemsMap;
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
    /** Renders without animation and interaction hints (exports, screenshots). */
    minimal?: boolean;
    /** Charts inside a dashboard animate nothing. */
    isInDashboard?: boolean;
    /**
     * Touch devices keep tooltips inside the chart container: appending them
     * to the body breaks positioning while dragging to scroll.
     * @see https://github.com/apache/echarts/issues/12776
     */
    isTouchDevice?: boolean;
};
