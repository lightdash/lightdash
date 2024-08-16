import { ChartKind } from '@lightdash/common';
import { createSelector } from 'reselect';
import { useVizSelector, type RootState } from '.';

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
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.options?.indexLayoutOptions,
        ),
);

const getValuesLayoutOptions = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.options?.valuesLayoutOptions,
        ),
);

const getXAxisField = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.config?.fieldConfig?.x,
        ),
);

const getYAxisFields = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.config?.fieldConfig?.y,
        ),
);

const getGroupByField = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.config?.fieldConfig?.groupBy?.[0],
        ),
);

const getPivotLayoutOptions = createSelector(
    [(state, chartKind) => chartKind],
    (selectedChartType) =>
        useVizSelector(
            (state) =>
                selectCurrentCartesianChartState(state, selectedChartType)
                    ?.options?.pivotLayoutOptions,
        ),
);

export const cartesianChartSelectors = {
    getIndexLayoutOptions,
    getValuesLayoutOptions,
    getXAxisField,
    getYAxisFields,
    getGroupByField,
    getPivotLayoutOptions,
};
