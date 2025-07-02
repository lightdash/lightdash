import type { Filters } from '../../types/filter';
import type { MetricQuery } from '../../types/metricQuery';
import type {
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from './schemas/tools';

export enum AiResultType {
    TIME_SERIES_RESULT = 'time_series_chart',
    VERTICAL_BAR_RESULT = 'vertical_bar_chart',
    ONE_LINE_RESULT = 'one_line_result',
    TABLE_RESULT = 'table',
}

export type AiMetricQuery = Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'sorts' | 'limit' | 'exploreName'
>;

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
