import {
    AllChartsSearchResult,
    isSavedChartSearchResult,
    isSqlChartSearchResult,
    toolFindChartsArgsSchema,
    toolFindChartsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type { FindChartsFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findCharts: FindChartsFn;
    pageSize: number;
    siteUrl?: string;
};

const getChartText = (chart: AllChartsSearchResult, siteUrl?: string) => {
    const isSavedChart = isSavedChartSearchResult(chart);
    const isSqlChart = isSqlChartSearchResult(chart);

    let chartUrl: string | undefined;
    if (isSavedChart) {
        chartUrl = siteUrl
            ? `${siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`
            : undefined;
    } else if (isSqlChart) {
        chartUrl = siteUrl
            ? `${siteUrl}/projects/${chart.projectUuid}/sql-runner/${chart.slug}#chart-link#chart-type-${chart.chartType}`
            : undefined;
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

export const getFindCharts = ({
    findCharts,
    pageSize,
    siteUrl,
}: Dependencies) =>
    tool({
        description: toolFindChartsArgsSchema.description,
        inputSchema: toolFindChartsArgsSchema,
        outputSchema: toolFindChartsOutputSchema,
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

                return {
                    result: `<SearchResults>${chartsText}</SearchResults>`,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error finding charts for search queries: ${args.chartSearchQueries
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
