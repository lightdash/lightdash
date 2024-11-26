export enum MetricExplorerComparison {
    PREVIOUS_PERIOD = 'previous_period',
    DIFFERENT_METRIC = 'different_metric',
}

export type MetricExplorerComparisonType =
    | { type: MetricExplorerComparison.PREVIOUS_PERIOD }
    | { type: MetricExplorerComparison.DIFFERENT_METRIC; metricName: string };
