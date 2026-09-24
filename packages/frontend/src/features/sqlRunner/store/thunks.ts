import {
    ChartKind,
    isApiError,
    type ApiErrorDetail,
    type ParametersValuesMap,
} from '@lightdash/common';
// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { type RootState } from '.';
import {
    selectChartDisplayByKind,
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';
import { selectSqlRunnerResultsRunner } from './sqlRunnerSlice';

/**
 * Run a sql query and return the results
 * @param sql - The sql query to run
 * @param limit - The limit of results to return
 * @param projectUuid - The project uuid to run the query on
 * @returns The results and the results runner
 */
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
        { rejectWithValue, getState },
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
            );
            return { ...results, warehouseConnectionUuid };
        } catch (error) {
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

/**
 * Prepare and fetch chart data for the selected chart type
 * @param forceRefresh - If true, invalidates the cache before fetching
 * @returns The chart data - this includes the table data, chart file url, and a function to get the chart spec
 */
export const prepareAndFetchChartData = createAsyncThunk(
    'cartesianChartBaseConfig/prepareAndFetchChartData',
    async (opts: { forceRefresh?: boolean } | undefined, { getState }) => {
        const state = getState() as RootState;
        const { forceRefresh = false } = opts ?? {};

        const currentVizConfig = selectCompleteConfigByKind(
            state,
            state.sqlRunner.selectedChartType,
        );

        const sortBy =
            currentVizConfig && 'fieldConfig' in currentVizConfig
                ? currentVizConfig.fieldConfig?.sortBy
                : undefined;
        const { selectedChartType, limit, sql } = state.sqlRunner;

        const resultsRunner = selectSqlRunnerResultsRunner(state, sortBy);

        const config = selectChartFieldConfigByKind(state, selectedChartType);

        if (!resultsRunner) {
            throw new Error('No results runner available');
        }

        // Invalidate cache when force refresh is requested (e.g., user clicks Run button)
        if (forceRefresh) {
            resultsRunner.invalidatePivotCache();
        }

        const vizDataModel = getChartDataModel(
            resultsRunner,
            config,
            selectedChartType ?? ChartKind.VERTICAL_BAR,
        );

        const chartData = await vizDataModel.getPivotedChartData({
            limit,
            sql,
            sortBy: [],
            filters: [],
        });

        const getChartSpec = (orgColors?: string[]) => {
            const currentState = getState() as RootState;
            const currentDisplay = selectChartDisplayByKind(
                currentState,
                selectedChartType,
            );
            return vizDataModel.getSpec(currentDisplay, orgColors);
        };

        const info = {
            ...chartData,
            getChartSpec,
            tableData: vizDataModel.getPivotedTableData(),
            chartFileUrl: vizDataModel.getDataDownloadUrl(),
        };

        return info;
    },
);
