import {
    type CartesianChartSqlConfig,
    type ChartKind,
    type PieChartSqlConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import { createAction } from '@reduxjs/toolkit';
import { type CartesianChartState } from '../cartesianChartBaseSlice';
import { type PieChartState } from '../pieChartSlice';
import { type TableVizState } from '../tableVisSlice';

type ResultsPayload =
    | {
          type: ChartKind.VERTICAL_BAR | ChartKind.LINE;
          options: CartesianChartState['options'];
      }
    | {
          type: ChartKind.PIE;
          options: PieChartState['options'];
      }
    | {
          type: ChartKind.TABLE;
          defaultColumnConfig: TableVizState['defaultColumnConfig'];
      };

export const onResults = createAction<ResultsPayload>('chart/onResults');

export const setChartConfig = createAction<
    CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig
>('chart/setChartConfig');
