import { z } from 'zod';
import { type MetricWithAssociatedTimeDimension } from './catalog';
import type { ItemsMap } from './field';
import type { ResultValue } from './results';

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
          metric: {
              label: string;
              table: string;
              name: string;
          };
      };

const metricExploreDataPointSchema = z.object({
    date: z.date({ coerce: true }),
    metric: z.object({
        value: z.number().nullable(),
        label: z.string().nullable(),
    }),
    compareMetric: z.object({
        value: z.number().nullable(),
        label: z.string().nullable(),
    }),
});

export const metricExploreDataPointWithDateValueSchema =
    metricExploreDataPointSchema.extend({
        dateValue: z.number(),
    });

// z.infer should be used here but it doesn't work with TSOA
export type MetricExploreDataPoint = {
    date: Date;
    metric: {
        value: number | null;
        label: string | null;
    };
    compareMetric: {
        value: number | null;
        label: string | null;
    };
};

// z.infer should be used here but it doesn't work with TSOA
export type MetricExploreDataPointWithDateValue = MetricExploreDataPoint & {
    dateValue: number;
};

export type MetricsExplorerQueryResults = {
    metric: MetricWithAssociatedTimeDimension;
    compareMetric: MetricWithAssociatedTimeDimension | undefined;
    fields: ItemsMap;
    results: MetricExploreDataPointWithDateValue[];
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
    value: ResultValue | undefined;
    comparisonValue: ResultValue | undefined;
};

export type ApiMetricsExplorerTotalResults = {
    status: 'ok';
    results: MetricTotalResults;
};
