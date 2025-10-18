import type { Filters } from '../../types/filter';
import type { AdditionalMetric, MetricQuery } from '../../types/metricQuery';
import type {
    ToolRunQueryArgs,
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from './schemas/tools';

export enum AiResultType {
    TIME_SERIES_RESULT = 'time_series_chart',
    VERTICAL_BAR_RESULT = 'vertical_bar_chart',
    TABLE_RESULT = 'table',
    QUERY_RESULT = 'query_result',
    DASHBOARD_RESULT = 'dashboard',
    DASHBOARD_V2_RESULT = 'dashboard_v2',
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
      }
    | {
          type: 'query_result';
          config: ToolRunQueryArgs;
      };
