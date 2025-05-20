import {
    isVizCartesianChartConfig,
    isVizTableConfig,
    type ApiError,
    type DashboardFilters,
    type IResultsRunner,
    type QueryExecutionContext,
    type RawResultRow,
    type SortField,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { type BaseResultsRunner } from '../../queryRunner/BaseResultsRunner';
import { getPivotQueryFunctionForDashboard } from '../../queryRunner/sqlRunnerPivotQueries';
import {
    SqlRunnerResultsRunnerChart,
    SqlRunnerResultsRunnerDashboard,
} from '../runners/SqlRunnerResultsRunnerFrontend';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';
import { fetchSavedSqlChart } from './useSavedSqlCharts';
import { getSqlChartResultsByUuid } from './useSqlChartResults';

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

export const useSavedSqlChartResults = (
    args: UseSavedSqlChartResultsArguments,
) => {
    // Separate chart results into two steps to provide a better loading + error experiences
    const { getResultsFromStream } = useResultsFromStreamWorker();

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
        {
            chartSpec: Record<string, any>;
            resultsRunner: IResultsRunner;
            fileUrl: string;
            chartUnderlyingData:
                | { columns: string[]; rows: RawResultRow[] }
                | undefined;
        },
        Partial<ApiError>
    >(
        ['savedSqlChartResults', savedSqlUuid ?? slug, args], // keep uuid/slug in the key to facilitate cache invalidation
        async () => {
            // Safe to assume these are defined because of the enabled flag
            const chart = chartQuery.data!;

            let resultsRunner: BaseResultsRunner;
            if (isDashboardArgs(args) && savedSqlUuid) {
                const pivotChartData = await getPivotQueryFunctionForDashboard({
                    projectUuid: projectUuid!,
                    dashboardUuid: args.dashboardUuid,
                    tileUuid: args.tileUuid,
                    dashboardFilters: args.dashboardFilters,
                    dashboardSorts: args.dashboardSorts,
                    savedSqlUuid,
                    context: args.context as QueryExecutionContext,
                });
                resultsRunner = new SqlRunnerResultsRunnerDashboard({
                    pivotChartData,
                });
            } else {
                // TODO: This shouldn't be needed - it gets the raw unpivoted results
                const chartResults = await getSqlChartResultsByUuid({
                    projectUuid: projectUuid!,
                    chartUuid: chart.savedSqlUuid,
                    getResultsFromStream,
                    context,
                });
                resultsRunner = new SqlRunnerResultsRunnerChart({
                    rows: chartResults.results,
                    columns: chartResults.columns,
                    projectUuid: projectUuid!,
                    savedSqlUuid: chart.savedSqlUuid,
                    ...(isVizCartesianChartConfig(chart.config) && {
                        sortBy: chart.config.fieldConfig?.sortBy,
                    }),
                });
            }

            const vizConfig = isVizTableConfig(chart.config)
                ? chart.config.columns
                : chart.config.fieldConfig;

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
                chartSpec: vizDataModel.getSpec(
                    chart.config.display,
                    organization?.chartColors,
                ),
                fileUrl: vizDataModel.getDataDownloadUrl()!, // TODO: this is known if the results have been fetched - can we improve the types on vizdatamodel?
                resultsRunner,
                chartUnderlyingData,
            };
        },
        {
            enabled:
                !!chartQuery.data &&
                !!projectUuid &&
                (!!savedSqlUuid || !!slug),
        },
    );
    return {
        chartQuery,
        chartResultsQuery,
    };
};
