import { type MetricWithAssociatedTimeDimension } from './catalog';
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
    | {
          type: MetricExplorerComparison.NONE;
      }
    | {
          type: MetricExplorerComparison.PREVIOUS_PERIOD;
      }
    | {
          type: MetricExplorerComparison.DIFFERENT_METRIC;
          metricTable: string;
          metricName: string;
      };

export type MetricExploreDataPoint = {
    date: Date;
    metric: unknown;
    compareMetric: unknown;
};

export type MetricsExplorerQueryResults = {
    metric: MetricWithAssociatedTimeDimension;
    comparisonMetric: MetricWithAssociatedTimeDimension | undefined;
    rows: ResultRow[];
    comparisonRows: ResultRow[] | undefined;
    fields: ItemsMap;
};

export type ApiMetricsExplorerQueryResults = {
    status: 'ok';
    results: MetricsExplorerQueryResults;
};
