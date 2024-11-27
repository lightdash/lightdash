import type { ResultRow } from './results';

export enum MetricExplorerComparison {
    PREVIOUS_PERIOD = 'previous_period',
    DIFFERENT_METRIC = 'different_metric',
}

export type MetricExplorerComparisonType =
    | { type: MetricExplorerComparison.PREVIOUS_PERIOD }
    | { type: MetricExplorerComparison.DIFFERENT_METRIC; metricName: string };

export type MetricsExplorerQueryResults = {
    rows: ResultRow[];
    comparisonRows: ResultRow[] | undefined;
};

export type ApiMetricsExplorerQueryResults = {
    status: 'ok';
    results: MetricsExplorerQueryResults;
};
