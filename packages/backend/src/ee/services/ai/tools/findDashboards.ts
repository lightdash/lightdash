import {
    DashboardSearchResult,
    toolFindDashboardsArgsSchema,
    toolFindDashboardsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type { FindDashboardsFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findDashboards: FindDashboardsFn;
    pageSize: number;
    siteUrl?: string;
};

const getDashboardText = (
    dashboard: DashboardSearchResult,
    siteUrl?: string,
) => {
    const dashboardUrl = siteUrl
        ? `${siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view#dashboard-link`
        : undefined;

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
                    const chartUrl = siteUrl
                        ? `${siteUrl}/projects/${dashboard.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`
                        : undefined;

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

const getDashboardsText = (
    args: Awaited<ReturnType<FindDashboardsFn>> & { searchQuery: string },
    siteUrl?: string,
) =>
    `
<SearchResult searchQuery="${args.searchQuery}" page="${
        args.pagination?.page
    }" pageSize="${args.pagination?.pageSize}" totalPageCount="${
        args.pagination?.totalPageCount
    }" totalResults="${args.pagination?.totalResults}">
    ${args.dashboards
        .map((dashboard) => getDashboardText(dashboard, siteUrl))
        .join('\n\n')}
</SearchResult>
`.trim();

export const getFindDashboards = ({
    findDashboards,
    pageSize,
    siteUrl,
}: Dependencies) =>
    tool({
        description: toolFindDashboardsArgsSchema.description,
        inputSchema: toolFindDashboardsArgsSchema,
        outputSchema: toolFindDashboardsOutputSchema,
        execute: async (args) => {
            try {
                const dashboardSearchQueryResults = await Promise.all(
                    args.dashboardSearchQueries.map(
                        async (dashboardSearchQuery) => ({
                            searchQuery: dashboardSearchQuery.label,
                            ...(await findDashboards({
                                dashboardSearchQuery,
                                page: args.page ?? 1,
                                pageSize,
                            })),
                        }),
                    ),
                );

                const dashboardsText = dashboardSearchQueryResults
                    .map((dashboardSearchQueryResult) =>
                        getDashboardsText(dashboardSearchQueryResult, siteUrl),
                    )
                    .join('\n\n');

                return {
                    result: `<SearchResults>${dashboardsText}</SearchResults>`,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error finding dashboards for search queries: ${args.dashboardSearchQueries
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
