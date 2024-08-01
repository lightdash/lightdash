import { ChartKind } from '@lightdash/common';
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
const selectTableVisConfigState = (
    state: RootState,
): RootState['tableVisConfig'] => state.tableVisConfig;

export const selectCurrentChartConfig = createSelector(
    [
        selectSqlRunnerState,
        selectBarChartConfigState,
        selectLineChartConfigState,
        selectPieChartConfigState,
        selectTableVisConfigState,
    ],
    (
        sqlRunnerState,
        barChartConfigState,
        lineChartConfigState,
        pieChartConfigState,
        tableVisConfigState,
    ) => {
        const { selectedChartType } = sqlRunnerState;
        if (selectedChartType === ChartKind.VERTICAL_BAR) {
            return barChartConfigState.config;
        } else if (selectedChartType === ChartKind.LINE) {
            return lineChartConfigState.config;
        } else if (selectedChartType === ChartKind.PIE) {
            return pieChartConfigState.config;
        } else if (selectedChartType === ChartKind.TABLE) {
            return tableVisConfigState.config;
        }
        return undefined;
    },
);
