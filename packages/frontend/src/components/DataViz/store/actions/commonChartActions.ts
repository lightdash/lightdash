import {
    type ChartKind,
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
    type VizConfigErrors,
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
        errors: VizConfigErrors | undefined;
    };
    [ChartKind.LINE]: {
        options: VizCartesianChartOptions;
        config: VizCartesianChartConfig;
        errors: VizConfigErrors | undefined;
    };
    [ChartKind.PIE]: {
        options: VizPieChartOptions;
        config: VizPieChartConfig;
        errors: VizConfigErrors | undefined;
    };
    [ChartKind.TABLE]: {
        options: VizTableOptions;
        config: VizTableConfig;
        errors: undefined;
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

export const resetChartState = createAction('chart/resetState');
