import { type MetricWithAssociatedTimeDimension } from './catalog';
import type { Dimension, ItemsMap } from './field';

export enum MetricExplorerComparison {
    NONE = 'none',
    PREVIOUS_PERIOD = 'previous_period',
    DIFFERENT_METRIC = 'different_metric',
}

export type MetricExplorerPartialDateRange = [Date | null, Date | null];
export type MetricExplorerDateRange = [Date, Date];

export type MetricExplorerQuery =
    | {
          comparison: MetricExplorerComparison.NONE;
          segmentDimension: string | null;
      }
    | {
          comparison: MetricExplorerComparison.PREVIOUS_PERIOD;
      }
    | {
          comparison: MetricExplorerComparison.DIFFERENT_METRIC;
          metric: {
              label: string;
              table: string;
              name: string;
          };
      };

export type MetricExploreDataPoint = {
    date: Date;
    segment: string | null;
    metric: {
        value: number | null;
        label: string | null;
    };
    compareMetric: {
        value: number | null;
        label: string | null;
    };
};

export type MetricExploreDataPointWithDateValue = MetricExploreDataPoint & {
    dateValue: number;
};

export type MetricsExplorerQueryResults = {
    metric: MetricWithAssociatedTimeDimension;
    compareMetric: MetricWithAssociatedTimeDimension | null;
    segmentDimension: Dimension | null;
    fields: ItemsMap;
    results: MetricExploreDataPointWithDateValue[];
    hasFilteredSeries: boolean;
};

export type ApiMetricsExplorerQueryResults = {
    status: 'ok';
    results: MetricsExplorerQueryResults;
};

export enum MetricTotalComparisonType {
    NONE = 'none',
    PREVIOUS_PERIOD = 'previous_period',
}

export type MetricTotalResults = {
    value: number | null;
    comparisonValue: number | null;
    metric: MetricWithAssociatedTimeDimension; // For now only previous period is supported in total query, so we only need the metric
};

export type ApiMetricsExplorerTotalResults = {
    status: 'ok';
    results: MetricTotalResults;
};
