import { configureStore } from '@reduxjs/toolkit';
import sqlRunnerReducer from './features/sqlRunner/sqlRunnerSlice';

export const store = configureStore({
    reducer: {
        sqlRunner: sqlRunnerReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
