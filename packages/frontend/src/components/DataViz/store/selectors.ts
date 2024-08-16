import { ChartKind } from '@lightdash/common';
import { createSelector } from 'reselect';
import { type RootState } from '.';
import { useAppSelector } from './hooks';

const selectBarChartConfigState = (
    state: RootState,
): RootState['barChartConfig'] => {
    return state.barChartConfig;
};
const selectLineChartConfigState = (
    state: RootState,
): RootState['lineChartConfig'] => state.lineChartConfig;
const selectPieChartConfigState = (
    state: RootState,
): RootState['pieChartConfig'] => state.pieChartConfig;
export const selectTableVisConfigState = (
    state: RootState,
): RootState['tableVisConfig'] => state.tableVisConfig;

export const selectChartConfigByKind = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
        selectPieChartConfigState,
        selectTableVisConfigState,
    ],
    (
        chartKind,
        barChartConfigState,
        lineChartConfigState,
        pieChartConfigState,
        tableVisConfigState,
    ) => {
        switch (chartKind) {
            case ChartKind.VERTICAL_BAR:
                return barChartConfigState.config;
            case ChartKind.LINE:
                return lineChartConfigState.config;
            case ChartKind.PIE:
                return pieChartConfigState.config;
            case ChartKind.TABLE:
                return tableVisConfigState.config;
            default:
                return undefined;
        }
    },
);

export const selectCurrentCartesianChartState = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (selectedChartType, barChartConfig, lineChartConfig) => {
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig;
        }
        return null;
    },
);

const getIndexLayoutOptions = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useAppSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.options?.indexLayoutOptions,
        ),
);

const getValuesLayoutOptions = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useAppSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.options?.valuesLayoutOptions,
        ),
);

const getXAxisField = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (selectedChartType, barChartConfig, lineChartConfig) => {
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig.config?.fieldConfig?.x;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig.config?.fieldConfig?.x;
        }
        return null;
    },
);

const getYAxisFields = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (selectedChartType, barChartConfig, lineChartConfig) => {
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig.config?.fieldConfig?.y;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig.config?.fieldConfig?.y;
        }
        return null;
    },
);

const getGroupByField = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (selectedChartType, barChartConfig, lineChartConfig) => {
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig.config?.fieldConfig?.groupBy?.[0];
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig.config?.fieldConfig?.groupBy?.[0];
        }
        return null;
    },
);

const getPivotLayoutOptions = createSelector(
    [
        (state, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (selectedChartType, barChartConfig, lineChartConfig) => {
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig.options.pivotLayoutOptions;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig.options.pivotLayoutOptions;
        }
        return null;
    },
);

export const cartesianChartSelectors = {
    getIndexLayoutOptions,
    getValuesLayoutOptions,
    getXAxisField,
    getYAxisFields,
    getGroupByField,
    getPivotLayoutOptions,
};
