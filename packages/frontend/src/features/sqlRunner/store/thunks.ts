// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';

import {
    ChartKind,
    isApiError,
    QueryHistoryStatus,
    type ApiDownloadAsyncQueryResults,
    type ApiErrorDetail,
    type ApiExecuteAsyncSqlQueryResults,
    type RawResultRow,
} from '@lightdash/common';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { type RootState } from '.';
import { lightdashApi } from '../../../api';
import {
    selectChartDisplayByKind,
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { getResultsFromStream } from '../../../utils/request';
import { pollForResults } from '../../queryRunner/pollQueryResults';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';
import { selectSqlRunnerResultsRunner } from './sqlRunnerSlice';

export const executeSqlQuery = async (
    projectUuid: string,
    sql: string,
    limit?: number,
): Promise<ResultsAndColumns> => {
    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({ sql, limit }),
    });

    const query = await pollForResults(projectUuid, response.queryUuid);

    if (query.status === QueryHistoryStatus.ERROR) {
        throw new Error(query.error || 'Error executing SQL query');
    }

    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const downloadResponse = await lightdashApi<ApiDownloadAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${response.queryUuid}/download`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    const results = await getResultsFromStream<RawResultRow>(
        downloadResponse.fileUrl,
    );

    return {
        fileUrl: downloadResponse.fileUrl,
        results,
        columns: Object.values(query.columns),
    };
};

/**
 * Run a sql query and return the results
 * @param sql - The sql query to run
 * @param limit - The limit of results to return
 * @param projectUuid - The project uuid to run the query on
 * @returns The results and the results runner
 */
export const runSqlQuery = createAsyncThunk<
    ResultsAndColumns,
    { sql: string; limit: number; projectUuid: string },
    { rejectValue: ApiErrorDetail }
>(
    'sqlRunner/runSqlQuery',
    async ({ sql, limit, projectUuid }, { rejectWithValue }) => {
        try {
            return await executeSqlQuery(projectUuid, sql, limit);
        } catch (error) {
            if (isApiError(error)) {
                return rejectWithValue(error.error);
            }
            throw error;
        }
    },
);

/**
 * Prepare and fetch chart data for the selected chart type
 * @returns The chart data - this includes the table data, chart file url, and a function to get the chart spec
 */
export const prepareAndFetchChartData = createAsyncThunk(
    'cartesianChartBaseConfig/prepareAndFetchChartData',
    async (_, { getState }) => {
        const state = getState() as RootState;

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
