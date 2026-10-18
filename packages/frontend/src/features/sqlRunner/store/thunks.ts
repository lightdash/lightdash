import {
    isApiError,
    type ApiErrorDetail,
    type ParametersValuesMap,
} from '@lightdash/common';
// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { type RootState } from '.';
import { cancelAsyncQuery } from '../../../api/asyncQuery';
import { reportSharedSignInQueryFailure } from '../../../hooks/useReconnectSharedSignIn';
import {
    executeSqlQuery,
    type ResultsAndColumns,
} from '../utils/executeSqlQuery';

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'AbortError';

/** Runs the editor's statement on the active connection and returns every row with the result's columns. */
export const runSqlQuery = createAsyncThunk<
    ResultsAndColumns & { warehouseConnectionUuid: string | null | undefined },
    {
        sql: string;
        limit: number;
        projectUuid: string;
        parameterValues: ParametersValuesMap;
    },
    { rejectValue: ApiErrorDetail }
>(
    'sqlRunner/runSqlQuery',
    async (
        { sql, limit, projectUuid, parameterValues },
        { rejectWithValue, getState, signal },
    ) => {
        const connectionRoute = (getState() as RootState).sqlRunner
            .connectionRoute ?? { route: 'pending' };
        if (connectionRoute.route === 'pending') {
            return rejectWithValue({
                statusCode: 400,
                name: 'ParameterError',
                message: 'The project is still loading. Run the query again.',
                data: {},
            });
        }
        const connection =
            connectionRoute.route === 'multi'
                ? connectionRoute.connection
                : undefined;
        if (connection === null) {
            return rejectWithValue({
                statusCode: 400,
                name: 'ParameterError',
                message: 'Choose a connection before you run this query.',
                data: {},
            });
        }
        const warehouseConnectionUuid = connection?.warehouseConnectionUuid;
        try {
            // SQL Runner is edit-only — always skip cache, matching explore edit mode.
            const results = await executeSqlQuery(
                projectUuid,
                sql,
                limit,
                parameterValues,
                true,
                warehouseConnectionUuid,
                {
                    signal,
                    onQueryStarted: (queryUuid) => {
                        // Aborting the thunk also tells the warehouse to stop
                        signal.addEventListener('abort', () => {
                            void cancelAsyncQuery(projectUuid, queryUuid);
                        });
                    },
                },
            );
            return { ...results, warehouseConnectionUuid };
        } catch (error) {
            if (isAbortError(error)) throw error;
            reportSharedSignInQueryFailure(projectUuid, error);
            if (isApiError(error)) {
                return rejectWithValue(error.error);
            }
            return rejectWithValue({
                statusCode: 500,
                name: 'QueryError',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
                data: {},
            });
        }
    },
);
