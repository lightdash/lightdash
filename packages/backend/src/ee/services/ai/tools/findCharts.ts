import {
    SavedChartSearchResult,
    toolFindChartsArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindChartsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findCharts: FindChartsFn;
    pageSize: number;
    siteUrl?: string;
};

const getChartText = (chart: SavedChartSearchResult, siteUrl?: string) => {
    const chartUrl = siteUrl
        ? `${siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`
        : undefined;

    return `
    <Chart chartUuid="${chart.uuid}">
        <Name>${chart.name}</Name>
        <SearchRank>${chart.search_rank}</SearchRank>
        <ChartType>${chart.chartType}</ChartType>
        ${
            chart.description
                ? `<Description>${chart.description}</Description>`
                : ''
        }
        ${chartUrl ? `<Url>${chartUrl}</Url>` : ''}
        <SpaceUuid>${chart.spaceUuid}</SpaceUuid>
    </Chart>
    `.trim();
};

const getChartsText = (
    args: Awaited<ReturnType<FindChartsFn>> & { searchQuery: string },
    siteUrl?: string,
) =>
    `
<SearchResult searchQuery="${args.searchQuery}" page="${
        args.pagination?.page
    }" pageSize="${args.pagination?.pageSize}" totalPageCount="${
        args.pagination?.totalPageCount
    }" totalResults="${args.pagination?.totalResults}">
    ${args.charts.map((chart) => getChartText(chart, siteUrl)).join('\n\n')}
</SearchResult>
`.trim();

export const toolFindChartsDescription = `Tool: findCharts

Purpose:
Finds saved charts by name or description within a project, returning detailed info about each.

Usage tips:
- Search for charts using partial names or descriptions
- If results aren't relevant, retry with clearer or more specific terms
- Results are paginated — use the page parameter to get more results if needed
- Returns chart URLs when available
- Charts are ordered by search relevance
`;

export const getFindCharts = ({
    findCharts,
    pageSize,
    siteUrl,
}: Dependencies) => {
    const schema = toolFindChartsArgsSchema;

    return tool({
        description: toolFindChartsDescription,
        parameters: schema,
        execute: async (args) => {
            try {
                const chartSearchQueryResults = await Promise.all(
                    args.chartSearchQueries.map(async (chartSearchQuery) => ({
                        searchQuery: chartSearchQuery.label,
                        ...(await findCharts({
                            chartSearchQuery,
                            page: args.page ?? 1,
                            pageSize,
                        })),
                    })),
                );

                const chartsText = chartSearchQueryResults
                    .map((chartSearchQueryResult) =>
                        getChartsText(chartSearchQueryResult, siteUrl),
                    )
                    .join('\n\n');

                return `<SearchResults>${chartsText}</SearchResults>`;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    `Error finding charts for search queries: ${args.chartSearchQueries
                        .map((q) => q.label)
                        .join(', ')}`,
                );
            }
        },
    });
};
