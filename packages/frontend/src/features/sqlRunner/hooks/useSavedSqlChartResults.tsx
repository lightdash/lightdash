import {
    type ApiDownloadAsyncQueryResults,
    type ApiError,
    type DashboardFilters,
    type IResultsRunner,
    type QueryExecutionContext,
    type RawResultRow,
    type ResultColumns,
    type SortField,
    type SqlChart,
    DownloadFileType,
    isVizTableConfig,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
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
        {
            queryUuid: string;
            chartSpec: Record<string, any>;
            resultsRunner: IResultsRunner;
            fileUrl: string;
            chartUnderlyingData:
                | { columns: string[]; rows: RawResultRow[] }
                | undefined;
            originalColumns: ResultColumns;
        },
        Partial<ApiError>
    >(
        ['savedSqlChartResults', savedSqlUuid ?? slug, args], // keep uuid/slug in the key to facilitate cache invalidation
        async () => {
            // Safe to assume these are defined because of the enabled flag
            const chart = chartQuery.data!;

            let { originalColumns, queryUuid, ...pivotChartData } =
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
                queryUuid,
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

    // Mutation to download results
    const downloadMutation = useMutation({
        mutationKey: ['download-sql-chart-results'],
        mutationFn: async ({
            limit,
            type = DownloadFileType.CSV,
        }: {
            limit?: number | null;
            type?: DownloadFileType;
        }) => {
            if (!chartResultsQuery.data || !chartQuery.data) {
                throw new Error('Chart results query or chart query not found');
            }

            // By default use current queryUuid
            let queryUuidToDownload = chartResultsQuery.data.queryUuid;
            // Create a new query with new args
            if (limit && limit !== chartQuery.data.limit) {
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
                              limit,
                          })
                        : await getSqlChartPivotChartData({
                              projectUuid: projectUuid!,
                              savedSqlUuid: chartQuery.data.savedSqlUuid,
                              context: context as QueryExecutionContext,
                              limit,
                          });
                queryUuidToDownload = queryForDownload.queryUuid;
            }

            const { fileUrl } =
                await lightdashApi<ApiDownloadAsyncQueryResults>({
                    url: `/projects/${projectUuid}/query/${queryUuidToDownload}/download?type=${type}`,
                    method: 'GET',
                    body: undefined,
                    version: 'v2',
                });

            const link = document.createElement('a');
            link.href = fileUrl;
            link.setAttribute('download', ''); // empty value so browser picks the file name.
            document.body.appendChild(link);
            link.click();
            link.remove(); // Remove the link from the DOM
        },
    });
    return {
        chartQuery,
        chartResultsQuery,
        downloadMutation:
            !chartResultsQuery.data || !chartQuery.data
                ? undefined
                : downloadMutation,
    };
};
