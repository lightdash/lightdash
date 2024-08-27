import {
    type CartesianChartSqlConfig,
    type ChartKind,
    type PieChartSqlConfig,
    type TableChartSqlConfig,
    type VizCartesianChartOptions,
    type VizPieChartOptions,
    type VizTableOptions,
} from '@lightdash/common';
import { createAction } from '@reduxjs/toolkit';

type ResultsPayload =
    | {
          type: ChartKind.VERTICAL_BAR | ChartKind.LINE;
          options: VizCartesianChartOptions;
      }
    | {
          type: ChartKind.PIE;
          options: VizPieChartOptions;
      }
    | {
          type: ChartKind.TABLE;
          options: VizTableOptions;
      };

export const onResults = createAction<ResultsPayload>('chart/onResults');

export const setChartConfig = createAction<
    CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig
>('chart/setChartConfig');
