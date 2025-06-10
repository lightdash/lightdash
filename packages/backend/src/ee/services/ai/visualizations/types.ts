import { CsvFileConfig } from './csvFile';
import { TimeSeriesMetricChartConfig } from './timeSeriesChart';
import { VerticalBarMetricChartConfig } from './verticalBarChart';

export type AiAgentVizConfig =
    | {
          type: 'vertical_bar_chart';
          config: VerticalBarMetricChartConfig;
      }
    | {
          type: 'time_series_chart';
          config: TimeSeriesMetricChartConfig;
      }
    | {
          type: 'csv';
          config: CsvFileConfig;
      };
