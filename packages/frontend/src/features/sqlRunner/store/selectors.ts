import { ChartKind, DimensionType, type SqlColumn } from '@lightdash/common';
import { createSelector } from 'reselect';
import { type RootState } from '.';

const selectSqlRunnerState = (state: RootState): RootState['sqlRunner'] =>
    state.sqlRunner;
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
    [selectSqlRunnerState, (state) => state],
    (sqlRunnerState, state) => {
        const { selectedChartType } = sqlRunnerState;
        return selectChartConfigByKind(state, selectedChartType);
    },
);

export const selectCurrentCartesianChartState = createSelector(
    [
        selectSqlRunnerState,
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

const getSqlColumns = (state: RootState): SqlColumn[] | undefined =>
    state.sqlRunner.sqlColumns;

const getXAxisField = createSelector(
    [selectCurrentCartesianChartState, getSqlColumns],
    (chartConfig, sqlColumns) => {
        const field = chartConfig?.config?.fieldConfig?.x;
        if (!field) return undefined;
        const fieldType =
            sqlColumns?.find((x) => x.reference === field.reference)?.type ??
            DimensionType.STRING;
        return { ...field, fieldType };
    },
);

const getYAxisFields = createSelector(
    [selectCurrentCartesianChartState, getSqlColumns],
    (chartConfig, sqlColumns) => {
        return chartConfig?.config?.fieldConfig?.y.map((field) => {
            const fieldType =
                sqlColumns?.find((x) => x.reference === field.reference)
                    ?.type ?? DimensionType.STRING;
            return { ...field, fieldType };
        });
    },
);

const getGroupByField = createSelector(
    [selectCurrentCartesianChartState, getSqlColumns],
    (chartConfig, sqlColumns) => {
        const field = chartConfig?.config?.fieldConfig?.groupBy?.[0];
        if (!field) return undefined;
        const fieldType =
            sqlColumns?.find((x) => x.reference === field.reference)?.type ??
            DimensionType.STRING;
        return { ...field, fieldType };
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
    getSqlColumns,
};

export const tableVisSelectors = {
    getColumnFieldTypes: createSelector(
        [selectTableVisConfigState, getSqlColumns],
        (tableVisConfig, sqlColumns) => {
            if (!tableVisConfig.config || !sqlColumns) return {};

            return Object.keys(tableVisConfig.config.columns).reduce(
                (acc, reference) => {
                    acc[reference] =
                        sqlColumns.find((c) => c.reference === reference)
                            ?.type ?? DimensionType.STRING;
                    return acc;
                },
                {} as Record<string, DimensionType>,
            );
        },
    ),
};
