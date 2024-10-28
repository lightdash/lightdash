import {
    ChartKind,
    type AllVizChartConfig,
    type PivotChartLayout,
} from '@lightdash/common';
import { createSelector } from 'reselect';
import { type RootState } from '../../../features/sqlRunner/store';
import { type TableVizState } from './tableVisSlice';

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
const selectTableVisConfigState = (
    state: RootState,
): RootState['tableVisConfig'] => state.tableVisConfig;

const selectChartMetadataByKind = createSelector(
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
                return barChartConfigState.metadata;
            case ChartKind.LINE:
                return lineChartConfigState.metadata;
            case ChartKind.PIE:
                return pieChartConfigState.metadata;
            case ChartKind.TABLE:
                return tableVisConfigState.metadata;
            default:
                return undefined;
        }
    },
);

export const selectChartFieldConfigByKind = createSelector(
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
                return barChartConfigState.fieldConfig;
            case ChartKind.LINE:
                return lineChartConfigState.fieldConfig;
            case ChartKind.PIE:
                return pieChartConfigState.fieldConfig;
            case ChartKind.TABLE:
                return tableVisConfigState.columns;
            default:
                return undefined;
        }
    },
);

export const selectChartDisplayByKind = createSelector(
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
                return barChartConfigState.display;
            case ChartKind.LINE:
                return lineChartConfigState.display;
            case ChartKind.PIE:
                return pieChartConfigState.display;
            case ChartKind.TABLE:
                return tableVisConfigState.display;
            default:
                return undefined;
        }
    },
);

export const selectCompleteConfigByKind = createSelector(
    [
        (state, chartKind) => chartKind,
        selectChartMetadataByKind,
        selectChartFieldConfigByKind,
        selectChartDisplayByKind,
    ],
    (
        chartKind,
        metadata,
        fieldConfig,
        display,
    ): AllVizChartConfig | undefined => {
        if (!metadata || !fieldConfig) {
            return undefined;
        }

        if (chartKind === ChartKind.TABLE) {
            return {
                type: chartKind,
                metadata: metadata,
                columns: fieldConfig as NonNullable<TableVizState['columns']>,
                display: display,
            };
        }

        return {
            type: chartKind,
            metadata: metadata,
            fieldConfig: fieldConfig as PivotChartLayout,
            display: display,
        };
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

export const selectPivotChartDataByKind = createSelector(
    [
        (_, chartKind) => chartKind,
        selectBarChartConfigState,
        selectLineChartConfigState,
        selectPieChartConfigState,
    ],
    (chartKind, barChartConfig, lineChartConfig, pieChartConfig) => {
        switch (chartKind) {
            case ChartKind.VERTICAL_BAR:
                return {
                    data: barChartConfig.chartData,
                    loading: barChartConfig.chartDataLoading,
                    error: barChartConfig.chartDataError,
                };
            case ChartKind.LINE:
                return {
                    data: lineChartConfig.chartData,
                    loading: lineChartConfig.chartDataLoading,
                    error: lineChartConfig.chartDataError,
                };
            case ChartKind.PIE:
                return {
                    data: pieChartConfig.chartData,
                    loading: pieChartConfig.chartDataLoading,
                    error: pieChartConfig.chartDataError,
                };
            default:
                return undefined;
        }
    },
);

const getIndexLayoutOptions = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.options?.indexLayoutOptions,
);

const getValuesLayoutOptions = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.options.valuesLayoutOptions,
);

const getXAxisField = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => ({
        ...chartState?.fieldConfig?.x,
        sortBy: chartState?.fieldConfig?.sortBy?.find(
            (sort) => sort.reference === chartState?.fieldConfig?.x?.reference,
        ),
    }),
);

const getYAxisFields = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.fieldConfig?.y,
);

const getGroupByField = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.fieldConfig?.groupBy?.[0],
);

const getPivotLayoutOptions = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.options?.pivotLayoutOptions,
);

const getErrors = createSelector(
    [(state, chartKind) => selectCurrentCartesianChartState(state, chartKind)],
    (chartState) => chartState?.errors,
);

export const cartesianChartSelectors = {
    getIndexLayoutOptions,
    getValuesLayoutOptions,
    getXAxisField,
    getYAxisFields,
    getGroupByField,
    getPivotLayoutOptions,
    getErrors,
};
