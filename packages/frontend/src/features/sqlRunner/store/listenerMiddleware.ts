import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from './index';
import {
    addChartConfigListener,
    addChartTypeListener,
    addSqlRunnerQueryListener,
} from './sqlRunnerListeners';

export const listenerMiddleware = createListenerMiddleware();

export type AppStartListening =
    typeof listenerMiddleware.startListening.withTypes<RootState, AppDispatch>;

export const startAppListening = listenerMiddleware.startListening.withTypes<
    RootState,
    AppDispatch
>();

addSqlRunnerQueryListener(startAppListening);
addChartConfigListener(startAppListening);
addChartTypeListener(startAppListening);
