import type { Filters } from '../../types/filter';
import type { AdditionalMetric, MetricQuery } from '../../types/metricQuery';
import type {
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from './schemas/tools';

export enum AiResultType {
    TIME_SERIES_RESULT = 'time_series_chart',
    VERTICAL_BAR_RESULT = 'vertical_bar_chart',
    TABLE_RESULT = 'table',
    DASHBOARD_RESULT = 'dashboard',
    IMPROVE_CONTEXT = 'improve_context',
    PROPOSE_CHANGE = 'propose_change',
}

export type AiMetricQuery = Pick<
    MetricQuery,
    | 'metrics'
    | 'dimensions'
    | 'sorts'
    | 'limit'
    | 'exploreName'
    | 'tableCalculations'
> & {
    additionalMetrics: Omit<AdditionalMetric, 'sql'>[];
};

export type AiMetricQueryWithFilters = AiMetricQuery & {
    filters: Filters;
};

export type AiAgentVizConfig =
    | {
          type: 'vertical_bar_chart';
          config: ToolVerticalBarArgs;
      }
    | {
          type: 'time_series_chart';
          config: ToolTimeSeriesArgs;
      }
    | {
          type: 'table';
          config: ToolTableVizArgs;
      };
