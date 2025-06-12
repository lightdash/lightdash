import {
    isVizTableConfig,
    MAX_SAFE_INTEGER,
    type ApiError,
    type DashboardFilters,
    type IResultsRunner,
    type QueryExecutionContext,
    type RawResultRow,
    type ResultColumns,
    type SortField,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import {
    getDashboardSqlChartPivotChartData,
    getSqlChartPivotChartData,
} from '../../queryRunner/sqlRunnerPivotQueries';
import { SqlChartResultsRunner } from '../runners/SqlRunnerResultsRunnerFrontend';
import { fetchSavedSqlChart } from './useSavedSqlCharts';

type SavedSqlChartArgs = {
    savedSqlUuid?: string;
    slug?: string;
    projectUuid?: string;
    context?: string;
};

type SavedSqlChartDashboardArgs = SavedSqlChartArgs & {
    dashboardUuid: string;
    tileUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
};

type UseSavedSqlChartResultsArguments =
    | SavedSqlChartArgs
    | SavedSqlChartDashboardArgs;

const isDashboardArgs = (
    args: UseSavedSqlChartResultsArguments,
): args is SavedSqlChartDashboardArgs => 'dashboardUuid' in args;

type UseSavedSqlChartResults = {
    queryUuid: string;
    chartSpec: Record<string, any>;
    resultsRunner: IResultsRunner;
    fileUrl: string;
    chartUnderlyingData:
        | { columns: string[]; rows: RawResultRow[] }
        | undefined;
    originalColumns: ResultColumns;
};

export const useSavedSqlChartResults = (
    args: UseSavedSqlChartResultsArguments,
) => {
    // Needed for organization colors
    const { data: organization } = useOrganization();

    const { savedSqlUuid, slug, projectUuid, context } = args;

    // Step 1: Get the chart
    const chartQuery = useQuery<SqlChart, Partial<ApiError>>(
        ['savedSqlChart', savedSqlUuid ?? slug],
        async () =>
            fetchSavedSqlChart({
                projectUuid: projectUuid!,
                uuid: savedSqlUuid,
                slug,
            }),
        {
            enabled: (!!savedSqlUuid || !!slug) && !!projectUuid,
        },
    );

    // Step 2: Get the results
    const chartResultsQuery = useQuery<
        UseSavedSqlChartResults,
        Partial<ApiError>
    >(
        ['savedSqlChartResults', savedSqlUuid ?? slug, args], // keep uuid/slug in the key to facilitate cache invalidation
        async () => {
            // Safe to assume these are defined because of the enabled flag
            const chart = chartQuery.data!;

            let { originalColumns, ...pivotChartData } =
                isDashboardArgs(args) && savedSqlUuid
                    ? await getDashboardSqlChartPivotChartData({
                          projectUuid: projectUuid!,
                          dashboardUuid: args.dashboardUuid,
                          tileUuid: args.tileUuid,
                          dashboardFilters: args.dashboardFilters,
                          dashboardSorts: args.dashboardSorts,
                          savedSqlUuid,
                          context: args.context as QueryExecutionContext,
                      })
                    : await getSqlChartPivotChartData({
                          projectUuid: projectUuid!,
                          savedSqlUuid: chart.savedSqlUuid,
                          context: context as QueryExecutionContext,
                      });

            const vizConfig = isVizTableConfig(chart.config)
                ? chart.config.columns
                : chart.config.fieldConfig;

            const resultsRunner = new SqlChartResultsRunner({
                pivotChartData,
                originalColumns,
            });

            const vizDataModel = getChartDataModel(
                resultsRunner,
                vizConfig,
                chart.config.type,
            );
            await vizDataModel.getPivotedChartData({
                sql: chart.sql,
                limit: chart.limit,
                sortBy: [],
                filters: [],
            });
            const chartUnderlyingData = vizDataModel.getPivotedTableData();
            return {
                queryUuid: pivotChartData.queryUuid,
                chartSpec: vizDataModel.getSpec(
                    chart.config.display,
                    organization?.chartColors,
                ),
                fileUrl: vizDataModel.getDataDownloadUrl()!, // TODO: this is known if the results have been fetched - can we improve the types on vizdatamodel?
                resultsRunner,
                chartUnderlyingData,
                originalColumns,
            };
        },
        {
            enabled:
                !!chartQuery.data &&
                !!projectUuid &&
                (!!savedSqlUuid || !!slug),
        },
    );

    // Get query uuid for download
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            if (!chartResultsQuery.data || !chartQuery.data) {
                throw new Error('Chart results query or chart query not found');
            }

            // By default use current queryUuid
            let queryUuidToDownload = chartResultsQuery.data.queryUuid;
            // Always execute a new query if:
            // 1. limit is null (meaning "all results" - should ignore existing query limits)
            // 2. limit is different from current query
            if (limit === null || limit !== chartQuery.data.limit) {
                const queryForDownload =
                    isDashboardArgs(args) && savedSqlUuid
                        ? await getDashboardSqlChartPivotChartData({
                              projectUuid: projectUuid!,
                              dashboardUuid: args.dashboardUuid,
                              tileUuid: args.tileUuid,
                              dashboardFilters: args.dashboardFilters,
                              dashboardSorts: args.dashboardSorts,
                              savedSqlUuid,
                              context: args.context as QueryExecutionContext,
                              limit: limit ?? MAX_SAFE_INTEGER,
                          })
                        : await getSqlChartPivotChartData({
                              projectUuid: projectUuid!,
                              savedSqlUuid: chartQuery.data.savedSqlUuid,
                              context: context as QueryExecutionContext,
                              limit: limit ?? MAX_SAFE_INTEGER,
                          });
                queryUuidToDownload = queryForDownload.queryUuid;
            }
            return queryUuidToDownload;
        },
        [
            args,
            chartQuery.data,
            chartResultsQuery.data,
            context,
            projectUuid,
            savedSqlUuid,
        ],
    );

    return {
        chartQuery,
        chartResultsQuery,
        getDownloadQueryUuid,
    };
};
