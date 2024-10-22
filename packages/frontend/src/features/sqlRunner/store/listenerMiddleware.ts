// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
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
