import type { ItemsMap } from './field';
import type { ResultRow } from './results';

export enum MetricExplorerComparison {
    NONE = 'none',
    PREVIOUS_PERIOD = 'previous_period',
    DIFFERENT_METRIC = 'different_metric',
}

export type MetricExplorerPartialDateRange = [Date | null, Date | null];
export type MetricExplorerDateRange = [Date, Date];

export type MetricExplorerComparisonType =
    | { type: MetricExplorerComparison.NONE }
    | { type: MetricExplorerComparison.PREVIOUS_PERIOD }
    | { type: MetricExplorerComparison.DIFFERENT_METRIC; metricName: string };

export type MetricExploreDataPoint = { date: Date; metric: unknown };
export type MetricExploreDataPointWithCompare = MetricExploreDataPoint & {
    compareMetric: unknown;
};

export type MetricsExplorerQueryResults = {
    rows: ResultRow[];
    comparisonRows: ResultRow[] | undefined;
    fields: ItemsMap;
};

export type ApiMetricsExplorerQueryResults = {
    status: 'ok';
    results: MetricsExplorerQueryResults;
};
