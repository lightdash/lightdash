import { ChartKind } from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type RootState } from '.';

const selectSemanticViewerRunnerState = (
    state: RootState,
): RootState['semanticViewer'] => state.semanticViewer;
const selectBarChartConfigState = (
    state: RootState,
): RootState['barChartConfig'] => state.barChartConfig;
const selectLineChartConfigState = (
    state: RootState,
): RootState['lineChartConfig'] => state.lineChartConfig;
const selectPieChartConfigState = (
    state: RootState,
): RootState['pieChartConfig'] => state.pieChartConfig;
const selectTableVisConfigState = (
    state: RootState,
): RootState['tableVisConfig'] => state.tableVisConfig;

const selectChartConfigByKind = createSelector(
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

export const selectCurrentChartConfig = createSelector(
    [selectSemanticViewerRunnerState, (state) => state],
    (sqlRunnerState, state) => {
        const { selectedChartType } = sqlRunnerState;
        return selectChartConfigByKind(state, selectedChartType);
    },
);

export const selectCurrentCartesianChartState = createSelector(
    [
        selectSemanticViewerRunnerState,
        selectBarChartConfigState,
        selectLineChartConfigState,
    ],
    (sqlRunnerState, barChartConfig, lineChartConfig) => {
        const { selectedChartType } = sqlRunnerState;
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfig;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfig;
        }
        return null;
    },
);

const getXLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.xLayoutOptions,
);

const getYLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.yLayoutOptions,
);

const getXAxisField = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.config?.fieldConfig?.x,
);

const getYAxisFields = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.config?.fieldConfig?.y,
);

const getGroupByField = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => {
        console.warn('group by not used', chartConfig);
        return []; //chartConfig?.config?.fieldConfig?.pivots?.[0],
    },
);

const getGroupByLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.groupByOptions,
);

export const cartesianChartSelectors = {
    getXLayoutOptions,
    getYLayoutOptions,
    getXAxisField,
    getYAxisFields,
    getGroupByField,
    getGroupByLayoutOptions,
};

const selectSelectedDimensions = (state: RootState) =>
    state.semanticViewer.selectedDimensions;
const selectSelectedTimeDimensions = (state: RootState) =>
    state.semanticViewer.selectedTimeDimensions;
const selectSelectedMetrics = (state: RootState) =>
    state.semanticViewer.selectedMetrics;

export const selectAllSelectedFieldsByKind = createSelector(
    [
        selectSelectedDimensions,
        selectSelectedTimeDimensions,
        selectSelectedMetrics,
    ],
    (dimensions, timeDimensions, metrics) => ({
        dimensions,
        timeDimensions,
        metrics,
    }),
);

export const selectAllSelectedFieldNames = createSelector(
    [selectAllSelectedFieldsByKind],
    ({ dimensions, metrics, timeDimensions }) => {
        return [
            ...dimensions.map((d) => d.name),
            ...timeDimensions.map((td) => td.name),
            ...metrics.map((m) => m.name),
        ];
    },
);
