// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';

import {
    ChartKind,
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    isVizCartesianChartConfig,
    type ApiErrorDetail,
    type CartesianChartDataModel,
    type PieChartDataModel,
    type PivotChartData,
    type RawResultRow,
    type TableDataModel,
} from '@lightdash/common';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { type RootState } from '.';
import {
    selectChartDisplayByKind,
    selectChartFieldConfigByKind,
    selectCompleteConfigByKind,
} from '../../../components/DataViz/store/selectors';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { getResultsFromStream } from '../../../utils/request';
import { getSqlRunnerCompleteJob } from '../hooks/requestUtils';
import {
    scheduleSqlJob,
    type ResultsAndColumns,
} from '../hooks/useSqlQueryRun';
import { SqlRunnerResultsRunnerFrontend } from '../runners/SqlRunnerResultsRunnerFrontend';
import { selectSqlRunnerResultsRunner } from './sqlRunnerSlice';

/**
 * Run a sql query and return the results
 * @param sql - The sql query to run
 * @param limit - The limit of results to return
 * @param projectUuid - The project uuid to run the query on
 * @returns The results and the results runner
 */
export const runSqlQuery = createAsyncThunk<
    ResultsAndColumns & {
        resultsRunner: SqlRunnerResultsRunnerFrontend;
        fileUrl: string | undefined;
    },
    { sql: string; limit: number; projectUuid: string },
    { rejectValue: ApiErrorDetail }
>(
    'sqlRunner/runSqlQuery',
    async ({ sql, limit, projectUuid }, { rejectWithValue }) => {
        try {
            const scheduledJob = await scheduleSqlJob({
                projectUuid,
                sql,
                limit,
            });

            const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);
            if (isApiSqlRunnerJobSuccessResponse(job)) {
                const url =
                    job.details && !isErrorDetails(job.details)
                        ? job.details.fileUrl
                        : undefined;

                const results = await getResultsFromStream<RawResultRow>(url);

                const columns =
                    job.details && !isErrorDetails(job.details)
                        ? job.details.columns
                        : [];

                const resultsRunner = new SqlRunnerResultsRunnerFrontend({
                    columns,
                    rows: results,
                    projectUuid,
                    limit,
                    sql,
                });

                return {
                    fileUrl: url,
                    results,
                    columns,
                    resultsRunner,
                };
            } else {
                return rejectWithValue(job.error);
            }
        } catch (error) {
            return rejectWithValue(error as ApiErrorDetail);
        }
    },
);

/**
 * Fetch pivot chart data
 * @param vizDataModel - The viz data model to fetch the pivot chart data for
 * @param limit - The limit of results to return
 * @param sql - The sql query to run
 * @returns The pivot chart data
 */
export const fetchPivotChartData = createAsyncThunk<
    PivotChartData | undefined,
    {
        vizDataModel:
            | TableDataModel
            | PieChartDataModel
            | CartesianChartDataModel;
        limit: number;
        sql: string;
    }
>(
    'cartesianChartBaseConfig/fetchPivotChartData',
    async ({ vizDataModel, limit, sql }) => {
        const chartData = await vizDataModel.getPivotedChartData({
            limit,
            sql,
            sortBy: [],
            filters: [],
        });
        return chartData;
    },
);

/**
 * Prepare and fetch chart data for the selected chart type
 * @returns The chart data - this includes the table data, chart file url, and a function to get the chart spec
 */
export const prepareAndFetchChartData = createAsyncThunk(
    'cartesianChartBaseConfig/prepareAndFetchChartData',
    async (_, { getState, dispatch }) => {
        const state = getState() as RootState;

        const currentVizConfig = selectCompleteConfigByKind(
            state,
            state.sqlRunner.selectedChartType,
        );

        const sortBy = isVizCartesianChartConfig(currentVizConfig)
            ? currentVizConfig.fieldConfig?.sortBy
            : undefined;

        const resultsRunner = selectSqlRunnerResultsRunner(state, sortBy);

        const { selectedChartType, limit, sql } = state.sqlRunner;

        const config = selectChartFieldConfigByKind(state, selectedChartType);

        if (!resultsRunner) {
            throw new Error('No results runner available');
        }

        const vizDataModel = getChartDataModel(
            resultsRunner,
            config,
            selectedChartType ?? ChartKind.VERTICAL_BAR,
        );

        const chartData = await dispatch(
            fetchPivotChartData({ vizDataModel, limit, sql }),
        ).unwrap();

        const getChartSpec = (orgColors: string[]) => {
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
