import {
    isApiError,
    isVizTableConfig,
    MAX_SAFE_INTEGER,
    type ApiError,
    type DashboardFilters,
    type IResultsRunner,
    type ParametersValuesMap,
    type QueryExecutionContext,
    type RawResultRow,
    type ResultColumns,
    type SortField,
    type SqlChart,
} from '@lightdash/common';
import { captureException } from '@sentry/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import getChartDataModel from '../../../components/DataViz/transformers/getChartDataModel';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useQueryRetryConfig } from '../../../hooks/useQueryRetry';
import {
    getDashboardSqlChartPivotChartData,
    getEmbedDashboardSqlChartPivotChartData,
    getSqlChartPivotChartData,
} from '../../queryRunner/sqlRunnerPivotQueries';
import { SqlChartResultsRunner } from '../runners/SqlRunnerResultsRunnerFrontend';
import {
    fetchEmbedDashboardSqlChartTile,
    fetchSavedSqlChart,
} from './useSavedSqlCharts';

type SavedSqlChartArgs = {
    savedSqlUuid?: string;
    slug?: string;
    projectUuid?: string;
    context?: string;
    parameters?: ParametersValuesMap;
};

type SavedSqlChartDashboardArgs = SavedSqlChartArgs & {
    dashboardUuid: string;
    tileUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    parameters?: ParametersValuesMap;
    // When true, the chart and its results are fetched via the /embed/*
    // routes, which authorize JWT users via dashboard membership instead
    // of requiring a registered account.
    isEmbed?: boolean;
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
    const retryConfig = useQueryRetryConfig();

    const { savedSqlUuid, slug, projectUuid, context, parameters } = args;
    const { data: resolvedPalette } = useProjectColorPalette(projectUuid, {
        dashboardUuid: isDashboardArgs(args) ? args.dashboardUuid : undefined,
    });

    const isEmbedDashboard = isDashboardArgs(args) && args.isEmbed === true;

    // Step 1: Get the chart. Embed dashboards must use the embed-only
    // endpoint, which authorizes via dashboard tile membership; the
    // registered endpoint requires a session user and 403s for JWT users.
    const chartQuery = useQuery<SqlChart, Partial<ApiError>>(
        [
            'savedSqlChart',
            savedSqlUuid ?? slug,
            isEmbedDashboard ? 'embed' : 'registered',
            isEmbedDashboard && isDashboardArgs(args)
                ? args.tileUuid
                : undefined,
        ],
        async () => {
            if (isEmbedDashboard && isDashboardArgs(args)) {
                return fetchEmbedDashboardSqlChartTile({
                    projectUuid: projectUuid!,
                    tileUuid: args.tileUuid,
                });
            }
            return fetchSavedSqlChart({
                projectUuid: projectUuid!,
                uuid: savedSqlUuid,
                slug,
            });
        },
        {
            enabled:
                (isEmbedDashboard
                    ? isDashboardArgs(args) && !!args.tileUuid
                    : !!savedSqlUuid || !!slug) && !!projectUuid,
            ...retryConfig,
        },
    );

    // Step 2: Get the results
    const chartResultsQuery = useQuery<
        UseSavedSqlChartResults,
        Partial<ApiError>
    >(
        ['savedSqlChartResults', savedSqlUuid ?? slug, args], // keep uuid/slug in the key to facilitate cache invalidation
        async () => {
            try {
                // Safe to assume these are defined because of the enabled flag
                const chart = chartQuery.data!;

                let { originalColumns, ...pivotChartData } = isDashboardArgs(
                    args,
                )
                    ? args.isEmbed
                        ? await getEmbedDashboardSqlChartPivotChartData({
                              projectUuid: projectUuid!,
                              tileUuid: args.tileUuid,
                              dashboardFilters: args.dashboardFilters,
                              dashboardSorts: args.dashboardSorts,
                              parameters,
                          })
                        : savedSqlUuid
                          ? await getDashboardSqlChartPivotChartData({
                                projectUuid: projectUuid!,
                                dashboardUuid: args.dashboardUuid,
                                tileUuid: args.tileUuid,
                                dashboardFilters: args.dashboardFilters,
                                dashboardSorts: args.dashboardSorts,
                                savedSqlUuid,
                                context: args.context as QueryExecutionContext,
                                parameters,
                            })
                          : await getSqlChartPivotChartData({
                                projectUuid: projectUuid!,
                                savedSqlUuid: chart.savedSqlUuid,
                                context: context as QueryExecutionContext,
                                parameters,
                            })
                    : await getSqlChartPivotChartData({
                          projectUuid: projectUuid!,
                          savedSqlUuid: chart.savedSqlUuid,
                          context: context as QueryExecutionContext,
                          parameters,
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
                        resolvedPalette?.colors,
                    ),
                    fileUrl: vizDataModel.getDataDownloadUrl()!, // TODO: this is known if the results have been fetched - can we improve the types on vizdatamodel?
                    resultsRunner,
                    chartUnderlyingData,
                    originalColumns,
                };
            } catch (e) {
                if (isApiError(e)) {
                    throw e;
                }
                captureException(e, {
                    tags: { errorType: 'chartResultsProcessing' },
                    extra: { chartData: chartQuery.data },
                });
                const message = e instanceof Error ? e.message : String(e);
                const wrapped: ApiError = {
                    status: 'error',
                    error: {
                        name: 'ChartResultsError',
                        statusCode: 500,
                        message,
                        data: {},
                    },
                };
                throw wrapped;
            }
        },
        {
            enabled:
                !!chartQuery.data &&
                !!projectUuid &&
                (isEmbedDashboard || !!savedSqlUuid || !!slug),
            ...retryConfig,
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
                const queryForDownload = isDashboardArgs(args)
                    ? args.isEmbed
                        ? await getEmbedDashboardSqlChartPivotChartData({
                              projectUuid: projectUuid!,
                              tileUuid: args.tileUuid,
                              dashboardFilters: args.dashboardFilters,
                              dashboardSorts: args.dashboardSorts,
                              limit: limit ?? MAX_SAFE_INTEGER,
                          })
                        : savedSqlUuid
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
