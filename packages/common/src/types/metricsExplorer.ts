import type { ItemsMap } from './field';
import type { ResultRow } from './results';

export enum MetricExplorerComparison {
    NONE = 'none',
    PREVIOUS_PERIOD = 'previous_period',
    DIFFERENT_METRIC = 'different_metric',
}

export type MetricExplorerDateRange = [Date | null, Date | null];

export type MetricExplorerComparisonType =
    | { type: MetricExplorerComparison.NONE }
    | { type: MetricExplorerComparison.PREVIOUS_PERIOD }
    | { type: MetricExplorerComparison.DIFFERENT_METRIC; metricName: string };

export type MetricsExplorerQueryResults = {
    rows: ResultRow[];
    comparisonRows: ResultRow[] | undefined;
    fields: ItemsMap;
};

export type ApiMetricsExplorerQueryResults = {
    status: 'ok';
    results: MetricsExplorerQueryResults;
};
