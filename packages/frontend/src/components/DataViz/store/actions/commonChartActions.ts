import {
    type CartesianChartSqlConfig,
    type PieChartSqlConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import { createAction } from '@reduxjs/toolkit';
import { type ResultsAndColumns } from '../../Results';
import { type ResultsTransformer } from '../../transformers/ResultsTransformer';

export const onResults = createAction<
    ResultsAndColumns & { transformer: ResultsTransformer }
>('chart/onResults');

export const setChartConfig = createAction<
    CartesianChartSqlConfig | PieChartSqlConfig | TableChartSqlConfig
>('chart/setChartConfig');
