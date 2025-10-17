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

type Dependencies = {
    findContent: FindContentFn;
    siteUrl: string;
};

const getChartText = (chart: AllChartsSearchResult, siteUrl: string) => {
    const isSavedChart = isSavedChartSearchResult(chart);
    const isSqlChart = isSqlChartSearchResult(chart);

    let chartUrl: string | undefined;
    if (isSavedChart) {
        chartUrl = `${siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`;
    } else if (isSqlChart) {
        chartUrl = `${siteUrl}/projects/${chart.projectUuid}/sql-runner/${chart.slug}#chart-link#chart-type-${chart.chartType}`;
    }

    return `
    <Chart chartUuid="${chart.uuid}">
        <Name>${chart.name}</Name>
        <SearchRank>${chart.search_rank}</SearchRank>
        <ChartType>${chart.chartType}</ChartType>
        <ChartSource>${chart.chartSource}</ChartSource>
        ${
            chart.description
                ? `<Description>${chart.description}</Description>`
                : ''
        }
        ${chartUrl ? `<Url>${chartUrl}</Url>` : ''}
        <SpaceUuid>${chart.spaceUuid}</SpaceUuid>
        <ViewsCount>${chart.viewsCount}</ViewsCount>
        ${
            chart.firstViewedAt
                ? `<FirstViewedAt>${moment(
                      chart.firstViewedAt,
                  ).fromNow()}</FirstViewedAt>`
                : ''
        }
        ${
            chart.lastModified
                ? `<LastModified>${moment(
                      chart.lastModified,
                  ).fromNow()}</LastModified>`
                : ''
        }
        ${
            chart.createdBy
                ? `<CreatedBy>${chart.createdBy.firstName} ${chart.createdBy.lastName}</CreatedBy>`
                : ''
        }
        ${
            chart.lastUpdatedBy
                ? `<LastUpdatedBy>${chart.lastUpdatedBy.firstName} ${chart.lastUpdatedBy.lastName}</LastUpdatedBy>`
                : ''
        }
    </Chart>
    `.trim();
};

const getDashboardText = (
    dashboard: DashboardSearchResult,
    siteUrl: string,
) => {
    const dashboardUrl = `${siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view#dashboard-link`;

    return `
    <Dashboard dashboardUuid="${dashboard.uuid}">
        <Name>${dashboard.name}</Name>
        <SearchRank>${dashboard.search_rank}</SearchRank>
        ${
            dashboard.description
                ? `<Description>${dashboard.description}</Description>`
                : ''
        }
        ${dashboardUrl ? `<Url>${dashboardUrl}</Url>` : ''}
        <SpaceUuid>${dashboard.spaceUuid}</SpaceUuid>
        <ViewsCount>${dashboard.viewsCount}</ViewsCount>
        ${
            dashboard.firstViewedAt
                ? `<FirstViewedAt>${moment(
                      dashboard.firstViewedAt,
                  ).fromNow()}</FirstViewedAt>`
                : ''
        }
        ${
            dashboard.lastModified
                ? `<LastModified>${moment(
                      dashboard.lastModified,
                  ).fromNow()}</LastModified>`
                : ''
        }
        ${
            dashboard.createdBy
                ? `<CreatedBy>${dashboard.createdBy.firstName} ${dashboard.createdBy.lastName}</CreatedBy>`
                : ''
        }
        ${
            dashboard.lastUpdatedBy
                ? `<LastUpdatedBy>${dashboard.lastUpdatedBy.firstName} ${dashboard.lastUpdatedBy.lastName}</LastUpdatedBy>`
                : ''
        }
        <Charts count="${dashboard.charts.length}">
            ${dashboard.charts
                .map((chart) => {
                    const chartUrl = `${siteUrl}/projects/${dashboard.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`;

                    return `<Chart chartUuid="${chart.uuid}">
                            <Name>${chart.name}</Name>
                            <ChartType>${chart.chartType}</ChartType>
                            ${
                                chart.description
                                    ? `<Description>${chart.description}</Description>`
                                    : ''
                            }
                            ${chartUrl ? `<Url>${chartUrl}</Url>` : ''}
                            <ViewsCount>${chart.viewsCount}</ViewsCount>
                        </Chart>`;
                })
                .join('\n            ')}
        </Charts>
        ${
            dashboard.validationErrors && dashboard.validationErrors.length > 0
                ? `<ValidationErrors count="${dashboard.validationErrors.length}"/>`
                : ''
        }
    </Dashboard>
    `.trim();
};

const getContentText = (
    args: Awaited<ReturnType<FindContentFn>> & { searchQuery: string },
    siteUrl: string,
) =>
    `
<SearchResult searchQuery="${args.searchQuery}">
    ${args.content
        .map((content) =>
            isDashboardSearchResult(content)
                ? getDashboardText(content, siteUrl)
                : getChartText(content, siteUrl),
        )
        .join('\n\n')}
</SearchResult>
`.trim();

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
                    result: `<SearchResults>${searchQueryResults
                        .map((searchQueryResult) =>
                            getContentText(searchQueryResult, siteUrl),
                        )
                        .join('\n\n')}</SearchResults>` as string,
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
