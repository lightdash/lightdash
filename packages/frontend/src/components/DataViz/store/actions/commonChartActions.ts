import {
    type ChartKind,
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
    type VizPieChartConfig,
    type VizPieChartOptions,
    type VizTableConfig,
    type VizTableOptions,
} from '@lightdash/common';
import { createAction } from '@reduxjs/toolkit';

type ChartTypeConfig = {
    [ChartKind.VERTICAL_BAR]: {
        options: VizCartesianChartOptions;
        config: VizCartesianChartConfig;
    };
    [ChartKind.LINE]: {
        options: VizCartesianChartOptions;
        config: VizCartesianChartConfig;
    };
    [ChartKind.PIE]: {
        options: VizPieChartOptions;
        config: VizPieChartConfig;
    };
    [ChartKind.TABLE]: {
        options: VizTableOptions;
        config: VizTableConfig;
    };
};

type ChartOptionsAndConfig = {
    [K in keyof ChartTypeConfig]: { type: K } & ChartTypeConfig[K];
}[keyof ChartTypeConfig];

type ChartConfig = ChartTypeConfig[keyof ChartTypeConfig]['config'];

export const setChartOptionsAndConfig = createAction<ChartOptionsAndConfig>(
    'chart/setChartOptionsAndConfig',
);

export const setChartConfig = createAction<ChartConfig>('chart/setChartConfig');
