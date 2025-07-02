import { TableVizTool } from './tableViz';
import { TimeSeriesVizTool } from './timeSeriesViz';
import { VerticalBarVizTool } from './verticalBarViz';

export type AiAgentVizConfig =
    | {
          type: 'vertical_bar_chart';
          config: VerticalBarVizTool;
      }
    | {
          type: 'time_series_chart';
          config: TimeSeriesVizTool;
      }
    | {
          type: 'table';
          config: TableVizTool;
      };
