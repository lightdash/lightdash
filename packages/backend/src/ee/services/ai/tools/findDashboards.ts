import {
    DashboardSearchResult,
    toolFindDashboardsArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindDashboardsFn } from '../types/aiAgentDependencies';
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
}: Dependencies) => {
    const schema = toolFindDashboardsArgsSchema;

    return tool({
        description: `Tool: "findDashboards"
                    Purpose:
                    Finds dashboards by name or description within a project, returning detailed info about each.

                    Usage tips:
                    - Search for dashboards using partial names or descriptions
                    - If results aren't relevant, retry with clearer or more specific terms
                    - Results are paginated — use the page parameter to get more results if needed
                    - Dashboards with validation errors will be deprioritized
                    - Returns dashboard URLs when available 
                    - It doesn't provide a dashboard summary yet, so don't suggest this capability
        `,
        parameters: schema,
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

                return `<SearchResults>${dashboardsText}</SearchResults>`;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    `Error finding dashboards for search queries: ${args.dashboardSearchQueries
                        .map((q) => q.label)
                        .join(', ')}`,
                );
            }
        },
    });
};
