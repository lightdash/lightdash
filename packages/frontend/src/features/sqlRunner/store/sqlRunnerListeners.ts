import { isAnyOf } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { setChartOptionsAndConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import { prepareAndFetchChartData } from '../../../components/DataViz/store/cartesianChartBaseSlice';
import {
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import { getChartConfigAndOptions } from '../../../components/DataViz/transformers/getChartConfigAndOptions';
import { type startAppListening } from './listenerMiddleware';
import {
    runSqlQuery,
    selectSqlRunnerResultsRunner,
    setSelectedChartType,
} from './sqlRunnerSlice';

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

            console.log('dispatching options', chartResultOptions);
            listenerApi.dispatch(setChartOptionsAndConfig(chartResultOptions));

            console.log('dispatching prepareAndFetchChartData');
            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};

export const addChartConfigListener = (
    startListening: typeof startAppListening,
) => {
    startListening({
        predicate: (_, currentState, previousState) => {
            const previousSelectedChartType =
                previousState.sqlRunner.selectedChartType;
            const currentSelectedChartType =
                currentState.sqlRunner.selectedChartType;

            console.log(
                'previousSelectedChartType',
                previousSelectedChartType,
                'currentSelectedChartType',
                currentSelectedChartType,
            );

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
            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};

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

            console.log('dispatching options', chartResultOptions);
            listenerApi.dispatch(setChartOptionsAndConfig(chartResultOptions));
            await listenerApi.dispatch(prepareAndFetchChartData());
        },
    });
};
