import { isAnyOf } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import {
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import { getChartConfigAndOptions } from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import { type startAppListening } from './listenerMiddleware';
import {
    selectSqlRunnerResultsRunner,
    setSelectedChartType,
} from './sqlRunnerSlice';
import { prepareAndFetchChartData, runSqlQuery } from './thunks';

/**
 * Add a listener for when the SQL query is run.
 * This listener will fetch the chart data and set the chart options and config.
 * @param startListening - The startAppListening function from listenerMiddleware.ts
 */
export const addSqlRunnerQueryListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        matcher: isAnyOf(runSqlQuery.fulfilled),
        effect: async (_, listenerApi) => {
            const state = listenerApi.getState();
            const resultsRunner = selectSqlRunnerResultsRunner(state);
            const selectedChartType = state.sqlRunner.selectedChartType;

            if (!resultsRunner || !selectedChartType) return;
            const completeConfigByKind = selectCompleteConfigByKind(
                state,
                selectedChartType,
            );

            const chartResultOptions = getChartConfigAndOptions(
                resultsRunner,
                selectedChartType,
                completeConfigByKind,
            );

            listenerApi.dispatch(setChartOptionsAndConfig(chartResultOptions));

            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};

/**
 * Add a listener for when the chart config is changed.
 * This listener will fetch the chart (runPivotQuery) data if the config has changed.
 * @param startListening - The startAppListening function from listenerMiddleware.ts
 */
export const addChartConfigListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const previousSelectedChartType =
                previousState.sqlRunner.selectedChartType;
            const currentSelectedChartType =
                currentState.sqlRunner.selectedChartType;

            const currentVizConfig = selectChartFieldConfigByKind(
                currentState,
                currentSelectedChartType,
            );
            const previousVizConfig = selectChartFieldConfigByKind(
                previousState,
                currentSelectedChartType,
            );
            return (
                !isEqual(currentVizConfig, previousVizConfig) ||
                previousSelectedChartType !== currentSelectedChartType
            );
        },
        effect: async (_, listenerApi) => {
            // TODO: this is the same as the listener for when the SQL query is run, should we combine them?
            const state = listenerApi.getState();
            const resultsRunner = selectSqlRunnerResultsRunner(state);
            const selectedChartType = state.sqlRunner.selectedChartType;

            if (!resultsRunner || !selectedChartType) return;
            const completeConfigByKind = selectCompleteConfigByKind(
                state,
                selectedChartType,
            );

            const chartResultOptions = getChartConfigAndOptions(
                resultsRunner,
                selectedChartType,
                completeConfigByKind,
            );

            listenerApi.dispatch(setChartOptionsAndConfig(chartResultOptions));
            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};

/**
 * Add a listener for when the chart type is changed.
 * This listener will fetch the chart (runPivotQuery) data if the chart type has changed.
 * @param startListening - The startAppListening function from listenerMiddleware.ts
 */
export const addChartTypeListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        matcher: isAnyOf(setSelectedChartType),
        effect: async (_, listenerApi) => {
            const state = listenerApi.getState();
            const selectedChartType = state.sqlRunner.selectedChartType;
            if (!selectedChartType) return;
            const completeConfigByKind = selectCompleteConfigByKind(
                state,
                selectedChartType,
            );

            const resultsRunner = selectSqlRunnerResultsRunner(state);

            const chartResultOptions = getChartConfigAndOptions(
                resultsRunner,
                selectedChartType,
                completeConfigByKind,
            );

            listenerApi.dispatch(setChartOptionsAndConfig(chartResultOptions));
            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};
