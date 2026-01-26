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
import type { FindContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    findContent: FindContentFn;
    siteUrl: string;
};

const renderChart = (chart: AllChartsSearchResult, siteUrl: string) => {
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
        </chart>
    );
};

const renderDashboard = (dashboard: DashboardSearchResult, siteUrl: string) => (
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
            {dashboard.charts.map((chart) => (
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
                </chart>
            ))}
        </charts>
        {dashboard.validationErrors && dashboard.validationErrors.length > 0 ? (
            <validationerrors count={dashboard.validationErrors.length} />
        ) : null}
    </dashboard>
);

const renderContent = (
    args: Awaited<ReturnType<FindContentFn>> & { searchQuery: string },
    siteUrl: string,
) => (
    <searchresult searchQuery={args.searchQuery}>
        {args.content.map((content) =>
            isDashboardSearchResult(content)
                ? renderDashboard(content, siteUrl)
                : renderChart(content, siteUrl),
        )}
    </searchresult>
);

export const getFindContent = ({ findContent, siteUrl }: Dependencies) =>
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

                return {
                    result: (
                        <searchresults>
                            {searchQueryResults.map((searchQueryResult) =>
                                renderContent(searchQueryResult, siteUrl),
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
