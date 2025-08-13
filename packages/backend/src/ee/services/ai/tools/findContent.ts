import {
    DashboardSearchResult,
    SavedChartSearchResult,
    SqlChartSearchResult,
    ToolFindDashboardsArgs,
    isSavedChartSearchResult,
    isSqlChartSearchResult,
    toolFindDashboardsArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindDashboardsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type UnifiedSearchResult =
    | (DashboardSearchResult & { contentType: 'dashboard' })
    | (SavedChartSearchResult & { contentType: 'chart' })
    | (SqlChartSearchResult & { contentType: 'chart' });

type FindContentFn = (args: {
    searchQuery: string;
    page: number;
    pageSize: number;
}) => Promise<{
    results: UnifiedSearchResult[];
    pagination: {
        page: number;
        pageSize: number;
        totalResults: number;
        totalPageCount: number;
    };
}>;

type Dependencies = {
    findContent: FindContentFn;
    pageSize: number;
    siteUrl?: string;
};

const getContentText = (content: UnifiedSearchResult, siteUrl?: string) => {
    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString();
    };

    if (content.contentType === 'dashboard') {
        const dashboardUrl = siteUrl
            ? `${siteUrl}/projects/${content.projectUuid}/dashboards/${content.uuid}/view#dashboard-link`
            : undefined;

        return `
    <Dashboard dashboardUuid="${content.uuid}">
        <Name>${content.name}</Name>
        <SearchRank>${content.search_rank}</SearchRank>
        <ContentType>dashboard</ContentType>
        ${
            content.description
                ? `<Description>${content.description}</Description>`
                : ''
        }
        ${dashboardUrl ? `<Url>${dashboardUrl}</Url>` : ''}
        <SpaceUuid>${content.spaceUuid}</SpaceUuid>
        <ViewsCount>${content.viewsCount}</ViewsCount>
        ${
            content.firstViewedAt
                ? `<FirstViewedAt>${formatDate(
                      content.firstViewedAt,
                  )}</FirstViewedAt>`
                : ''
        }
        ${
            content.lastModified
                ? `<LastModified>${formatDate(
                      content.lastModified,
                  )}</LastModified>`
                : ''
        }
        ${
            content.createdBy
                ? `<CreatedBy>${content.createdBy.firstName} ${content.createdBy.lastName}</CreatedBy>`
                : ''
        }
        <Charts count="${content.charts.length}">
            ${content.charts
                .map(
                    (chart) =>
                        `<Chart>
                        <Name>${chart.name}</Name>
                        <ChartType>${chart.chartType}</ChartType>
                        ${
                            chart.description
                                ? `<Description>${chart.description}</Description>`
                                : ''
                        }
                        <ViewsCount>${chart.viewsCount}</ViewsCount>
                    </Chart>`,
                )
                .join('\n            ')}
        </Charts>
        ${
            content.validationErrors && content.validationErrors.length > 0
                ? `<ValidationErrors count="${content.validationErrors.length}"/>`
                : ''
        }
    </Dashboard>
    `.trim();
    }

    // Handle chart content
    const isSavedChart = isSavedChartSearchResult(content);
    const isSqlChart = isSqlChartSearchResult(content);

    let chartUrl: string | undefined;
    if (isSavedChart) {
        chartUrl = siteUrl
            ? `${siteUrl}/projects/${content.projectUuid}/saved/${content.uuid}/view#chart-link#chart-type-${content.chartType}`
            : undefined;
    } else if (isSqlChart && 'slug' in content) {
        chartUrl = siteUrl
            ? `${siteUrl}/projects/${content.projectUuid}/sql-runner/${content.slug}#chart-link#chart-type-${content.chartType}`
            : undefined;
    }

    return `
    <Chart chartUuid="${content.uuid}">
        <Name>${content.name}</Name>
        <SearchRank>${content.search_rank}</SearchRank>
        <ContentType>chart</ContentType>
        <ChartType>${content.chartType}</ChartType>
        <ChartSource>${isSavedChart ? 'saved' : 'sql'}</ChartSource>
        ${
            content.description
                ? `<Description>${content.description}</Description>`
                : ''
        }
        ${chartUrl ? `<Url>${chartUrl}</Url>` : ''}
        <SpaceUuid>${content.spaceUuid}</SpaceUuid>
        <ViewsCount>${content.viewsCount}</ViewsCount>
        ${
            content.firstViewedAt
                ? `<FirstViewedAt>${formatDate(
                      content.firstViewedAt,
                  )}</FirstViewedAt>`
                : ''
        }
        ${
            content.lastModified
                ? `<LastModified>${formatDate(
                      content.lastModified,
                  )}</LastModified>`
                : ''
        }
        ${
            content.createdBy
                ? `<CreatedBy>${content.createdBy.firstName} ${content.createdBy.lastName}</CreatedBy>`
                : ''
        }
    </Chart>
    `.trim();
};

const getContentSearchText = (
    args: Awaited<ReturnType<FindContentFn>> & { searchQuery: string },
    siteUrl?: string,
) =>
    `
<SearchResult searchQuery="${args.searchQuery}" page="${
        args.pagination?.page
    }" pageSize="${args.pagination?.pageSize}" totalPageCount="${
        args.pagination?.totalPageCount
    }" totalResults="${args.pagination?.totalResults}">
    ${args.results
        .map((content) => getContentText(content, siteUrl))
        .join('\n\n')}
</SearchResult>
`.trim();

export const getFindContent = ({
    findContent,
    pageSize,
    siteUrl,
}: Dependencies) =>
    tool({
        description:
            'Search across all content types (dashboards and charts) with unified ranking by relevance. This enables hierarchy-free search where results are ranked by relevance rather than content type.',
        parameters: toolFindDashboardsArgsSchema, // Reuse the same schema for now
        execute: async (args: ToolFindDashboardsArgs) => {
            try {
                const searchResults = await Promise.all(
                    args.dashboardSearchQueries.map(
                        async (searchQuery: { label: string }) => ({
                            searchQuery: searchQuery.label,
                            ...(await findContent({
                                searchQuery: searchQuery.label,
                                page: args.page ?? 1,
                                pageSize,
                            })),
                        }),
                    ),
                );

                const resultsText = searchResults
                    .map((searchResult) =>
                        getContentSearchText(searchResult, siteUrl),
                    )
                    .join('\n\n');

                return `<SearchResults>${resultsText}</SearchResults>`;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    `Error finding content for search queries: ${args.dashboardSearchQueries
                        .map((q: { label: string }) => q.label)
                        .join(', ')}`,
                );
            }
        },
    });
