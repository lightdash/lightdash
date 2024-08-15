import { ChartKind } from '@lightdash/common';
import { createSelector } from 'reselect';
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
export const selectTableVisConfigState = (
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

const getIndexLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.indexLayoutOptions,
);

const getValuesLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.valuesLayoutOptions,
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
    (chartConfig) => chartConfig?.config?.fieldConfig?.groupBy?.[0],
);

const getPivotLayoutOptions = createSelector(
    [selectCurrentCartesianChartState],
    (chartConfig) => chartConfig?.options?.pivotLayoutOptions,
);

export const cartesianChartSelectors = {
    getIndexLayoutOptions,
    getValuesLayoutOptions,
    getXAxisField,
    getYAxisFields,
    getGroupByField,
    getPivotLayoutOptions,
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
        dimensions: Object.values(dimensions),
        timeDimensions: Object.values(timeDimensions),
        metrics: Object.values(metrics),
    }),
);

export const getSelectedField = (name: string) =>
    createSelector(
        [
            selectSelectedDimensions,
            selectSelectedTimeDimensions,
            selectSelectedMetrics,
        ],
        (dimensions, timeDimensions, metrics) => {
            return name in dimensions
                ? dimensions[name]
                : null ?? name in timeDimensions
                ? timeDimensions[name]
                : null ?? name in metrics
                ? metrics[name]
                : null ?? null;
        },
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
