import { configureStore } from '@reduxjs/toolkit';
import sqlRunnerReducer from './sqlRunnerSlice';

export const store = configureStore({
    reducer: {
        sqlRunner: sqlRunnerReducer,
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
