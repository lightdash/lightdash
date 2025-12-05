import {
    AllChartsSearchResult,
    DashboardSearchResult,
    isDashboardSearchResult,
    isSavedChartSearchResult,
    isSqlChartSearchResult,
    toolFindContentArgsSchema,
    toolFindContentOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type {
    FindContentFn,
    RunSavedChartQueryFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    findContent: FindContentFn;
    runSavedChartQuery?: RunSavedChartQueryFn;
    siteUrl: string;
};

const renderChart = (
    chart: AllChartsSearchResult,
    siteUrl: string,
    queryResult?: { csv: string } | { error: true },
) => {
    const isSavedChart = isSavedChartSearchResult(chart);
    const isSqlChart = isSqlChartSearchResult(chart);

    let chartUrl: string | undefined;
    if (isSavedChart) {
        chartUrl = `${siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`;
    } else if (isSqlChart) {
        chartUrl = `${siteUrl}/projects/${chart.projectUuid}/sql-runner/${chart.slug}#chart-link#chart-type-${chart.chartType}`;
    }

    return (
        <chart
            chartUuid={chart.uuid}
            searchRank={chart.search_rank}
            chartType={chart.chartType}
            chartSource={chart.chartSource}
            spaceUuid={chart.spaceUuid}
            viewsCount={chart.viewsCount}
            href={chartUrl}
        >
            <name>{chart.name}</name>
            {chart.description && (
                <description>{chart.description}</description>
            )}
            {chart.firstViewedAt && (
                <firstviewedat>
                    {moment(chart.firstViewedAt).fromNow()}
                </firstviewedat>
            )}
            {chart.lastModified && (
                <lastmodified>
                    {moment(chart.lastModified).fromNow()}
                </lastmodified>
            )}
            {chart.createdBy && (
                <createdby>
                    {`${chart.createdBy.firstName} ${chart.createdBy.lastName}`}
                </createdby>
            )}
            {chart.lastUpdatedBy && (
                <lastupdatedby>
                    {`${chart.lastUpdatedBy.firstName} ${chart.lastUpdatedBy.lastName}`}
                </lastupdatedby>
            )}
            {queryResult && 'csv' in queryResult && (
                <data format="csv">{queryResult.csv}</data>
            )}
            {queryResult && 'error' in queryResult && (
                <queryError>Query failed</queryError>
            )}
        </chart>
    );
};

const renderDashboard = (
    dashboard: DashboardSearchResult,
    siteUrl: string,
    queryResultsMap?: Map<string, { csv: string } | { error: true }>,
) => (
    <dashboard
        dashboardUuid={dashboard.uuid}
        spaceUuid={dashboard.spaceUuid}
        viewCount={dashboard.viewsCount}
        href={`${siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view#dashboard-link`}
    >
        <name>{dashboard.name}</name>
        <searchrank>{dashboard.search_rank}</searchrank>

        {dashboard.description && (
            <description>{dashboard.description}</description>
        )}

        {dashboard.firstViewedAt && (
            <firstviewedat>
                {moment(dashboard.firstViewedAt).fromNow()}
            </firstviewedat>
        )}

        {dashboard.lastModified && (
            <lastmodified>
                {moment(dashboard.lastModified).fromNow()}
            </lastmodified>
        )}
        {dashboard.createdBy && (
            <createdby>
                {`${dashboard.createdBy.firstName} ${dashboard.createdBy.lastName}`}
            </createdby>
        )}
        {dashboard.lastUpdatedBy && (
            <lastupdatedby>
                {`${dashboard.lastUpdatedBy.firstName} ${dashboard.lastUpdatedBy.lastName}`}
            </lastupdatedby>
        )}
        <charts count={dashboard.charts.length}>
            {dashboard.charts.map((chart) => {
                const queryResult = queryResultsMap?.get(chart.uuid);
                return (
                    <chart
                        chartUuid={chart.uuid}
                        chartType={chart.chartType}
                        viewsCount={chart.viewsCount}
                        href={`${siteUrl}/projects/${dashboard.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`}
                    >
                        <name>{chart.name}</name>
                        {chart.description && (
                            <description>{chart.description}</description>
                        )}
                        {queryResult && 'csv' in queryResult && (
                            <data format="csv">{queryResult.csv}</data>
                        )}
                        {queryResult && 'error' in queryResult && (
                            <queryError>Query failed</queryError>
                        )}
                    </chart>
                );
            })}
        </charts>
        {dashboard.validationErrors && dashboard.validationErrors.length > 0 ? (
            <validationerrors count={dashboard.validationErrors.length} />
        ) : null}
    </dashboard>
);

const renderContent = (
    args: Awaited<ReturnType<FindContentFn>> & { searchQuery: string },
    siteUrl: string,
    queryResultsMap?: Map<string, { csv: string } | { error: true }>,
) => (
    <searchresult searchQuery={args.searchQuery}>
        {args.content.map((content) =>
            isDashboardSearchResult(content)
                ? renderDashboard(content, siteUrl, queryResultsMap)
                : renderChart(
                      content,
                      siteUrl,
                      queryResultsMap?.get(content.uuid),
                  ),
        )}
    </searchresult>
);

export const getFindContent = ({
    findContent,
    runSavedChartQuery,
    siteUrl,
}: Dependencies) =>
    tool({
        description: toolFindContentArgsSchema.description,
        inputSchema: toolFindContentArgsSchema,
        outputSchema: toolFindContentOutputSchema,
        execute: async (args) => {
            try {
                const searchQueryResults = await Promise.all(
                    args.searchQueries.map(async (searchQuery) => ({
                        searchQuery: searchQuery.label,
                        ...(await findContent({
                            searchQuery,
                        })),
                    })),
                );

                // Collect charts to query: prioritize top 1 dashboard charts, then fill with standalone
                let queryResultsMap:
                    | Map<string, { csv: string } | { error: true }>
                    | undefined;

                if (runSavedChartQuery) {
                    const QUERY_LIMIT = 5;
                    const chartsToQuery: { uuid: string }[] = [];

                    // 1. Get charts from top 1 dashboard first
                    const allDashboards = searchQueryResults.flatMap((result) =>
                        result.content.filter(isDashboardSearchResult),
                    );
                    const topDashboard = allDashboards[0];
                    if (topDashboard) {
                        chartsToQuery.push(...topDashboard.charts);
                    }

                    // 2. Fill remaining with standalone charts (avoid duplicates)
                    const dashboardChartUuids = new Set(
                        chartsToQuery.map((c) => c.uuid),
                    );
                    const standaloneCharts = searchQueryResults
                        .flatMap((result) =>
                            result.content.filter(isSavedChartSearchResult),
                        )
                        .filter(
                            (chart) => !dashboardChartUuids.has(chart.uuid),
                        );

                    const remainingSlots = Math.max(
                        0,
                        QUERY_LIMIT - chartsToQuery.length,
                    );
                    chartsToQuery.push(
                        ...standaloneCharts.slice(0, remainingSlots),
                    );

                    // Run queries in parallel
                    const queryResultsArray = await Promise.allSettled(
                        chartsToQuery.map((chart) =>
                            runSavedChartQuery({
                                chartUuid: chart.uuid,
                                limit: 100,
                            }),
                        ),
                    );

                    // Map results back to charts
                    queryResultsMap = new Map();
                    chartsToQuery.forEach((chart, index) => {
                        const result = queryResultsArray[index];
                        if (result.status === 'fulfilled') {
                            const csv = convertQueryResultsToCsv({
                                ...result.value,
                                cacheMetadata: {
                                    cacheHit: false,
                                    cacheUpdatedTime: undefined,
                                },
                            });
                            queryResultsMap!.set(chart.uuid, { csv });
                        } else {
                            queryResultsMap!.set(chart.uuid, {
                                error: true,
                            });
                        }
                    });
                }

                return {
                    result: (
                        <searchresults>
                            {searchQueryResults.map((searchQueryResult) =>
                                renderContent(
                                    searchQueryResult,
                                    siteUrl,
                                    queryResultsMap,
                                ),
                            )}
                        </searchresults>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error finding content for search queries: ${args.searchQueries
                            .map((q) => q.label)
                            .join(', ')}`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
