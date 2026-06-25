import {
    AllChartsSearchResult,
    ContentVerificationInfo,
    DashboardSearchResult,
    findContentToolDefinition,
    isSavedChartSearchResult,
    isSqlChartSearchResult,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type {
    FindContentChartResult,
    FindContentDashboardResult,
    FindContentFn,
    FindContentResult,
    FindContentSpaceMetadata,
    FindContentSpaceResult,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { DASHBOARD_CHARTS_PREVIEW_COUNT, truncate } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';

const renderVerified = (verification: ContentVerificationInfo | null) =>
    verification ? (
        <verified
            by={`${verification.verifiedBy.firstName} ${verification.verifiedBy.lastName}`}
            at={moment(verification.verifiedAt).fromNow()}
        />
    ) : null;

type Dependencies = {
    findContent: FindContentFn;
    siteUrl: string;
    toolDescriptionMaxChars: number;
    trackCoverage: (coverage: {
        searchQuery: string;
        totalResultCount: number;
        verifiedResultCount: number;
        topResultVerified: boolean;
    }) => void;
};

const toolDefinition = findContentToolDefinition.for('agent');

const renderSpaceMetadata = (space: FindContentSpaceMetadata) => (
    <space
        uuid={space.uuid}
        name={space.name}
        slug={space.slug}
        breadcrumb={space.breadcrumbs.map((item) => item.name).join(' / ')}
    />
);

const renderSpace = (space: FindContentSpaceResult) => (
    <spaceResult
        spaceUuid={space.uuid}
        slug={space.slug}
        searchRank={space.search_rank}
        chartCount={space.chartCount}
        dashboardCount={space.dashboardCount}
        childSpaceCount={space.childSpaceCount}
        appCount={space.appCount}
        directAccess={space.directAccess}
    >
        <name>{space.name}</name>
        {renderSpaceMetadata(space.space)}
    </spaceResult>
);

const renderChart = (
    chart: AllChartsSearchResult & Pick<FindContentChartResult, 'space'>,
    siteUrl: string,
    toolDescriptionMaxChars: number,
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
            slug={chart.slug}
            searchRank={chart.search_rank}
            chartType={chart.chartType}
            chartSource={chart.chartSource}
            spaceUuid={chart.spaceUuid}
            viewsCount={chart.viewsCount}
            href={chartUrl}
        >
            <name>{chart.name}</name>
            {renderSpaceMetadata(chart.space)}
            {chart.description && (
                <description>
                    {truncate(chart.description, toolDescriptionMaxChars)}
                </description>
            )}
            {renderVerified(chart.verification)}
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

const renderDashboard = (
    dashboard: DashboardSearchResult &
        Pick<FindContentDashboardResult, 'space'>,
    siteUrl: string,
    toolDescriptionMaxChars: number,
) => (
    <dashboard
        dashboardUuid={dashboard.uuid}
        slug={dashboard.slug}
        spaceUuid={dashboard.spaceUuid}
        viewCount={dashboard.viewsCount}
        href={`${siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view#dashboard-link`}
    >
        <name>{dashboard.name}</name>
        <searchrank>{dashboard.search_rank}</searchrank>
        {renderSpaceMetadata(dashboard.space)}

        {dashboard.description && (
            <description>
                {truncate(dashboard.description, toolDescriptionMaxChars)}
            </description>
        )}
        {renderVerified(dashboard.verification)}

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
            {[...dashboard.charts]
                .sort(
                    (a, b) =>
                        Number(b.verification !== null) -
                        Number(a.verification !== null),
                )
                .slice(0, DASHBOARD_CHARTS_PREVIEW_COUNT)
                .map((chart) => (
                    <chart chartUuid={chart.uuid} chartType={chart.chartType}>
                        <name>{chart.name}</name>
                        {chart.description && (
                            <description>
                                {truncate(
                                    chart.description,
                                    toolDescriptionMaxChars,
                                )}
                            </description>
                        )}
                        {renderVerified(chart.verification)}
                    </chart>
                ))}
        </charts>
        {dashboard.validationErrors && dashboard.validationErrors.length > 0 ? (
            <validationerrors count={dashboard.validationErrors.length} />
        ) : null}
    </dashboard>
);

const isDashboardResult = (
    content: FindContentResult,
): content is FindContentDashboardResult => content.contentType === 'dashboard';

const isSpaceResult = (
    content: FindContentResult,
): content is FindContentSpaceResult => content.contentType === 'space';

const renderContent = (
    args: Awaited<ReturnType<FindContentFn>> & { searchQuery: string },
    siteUrl: string,
    toolDescriptionMaxChars: number,
) => {
    const sortedContent = [...args.content].sort(
        (a, b) =>
            Number(b.verification !== null) - Number(a.verification !== null),
    );
    return (
        <searchresult searchQuery={args.searchQuery}>
            {sortedContent.map((content) => {
                if (isSpaceResult(content)) {
                    return renderSpace(content);
                }
                return isDashboardResult(content)
                    ? renderDashboard(content, siteUrl, toolDescriptionMaxChars)
                    : renderChart(content, siteUrl, toolDescriptionMaxChars);
            })}
        </searchresult>
    );
};

export const getFindContent = ({
    findContent,
    siteUrl,
    toolDescriptionMaxChars,
    trackCoverage,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const searchQueryResults = await Promise.all(
                    args.searchQueries.map(async (searchQuery) => ({
                        searchQuery: searchQuery.label,
                        ...(await findContent({
                            searchQuery,
                            spaceSlug: args.spaceSlug ?? null,
                        })),
                    })),
                );

                for (const searchQueryResult of searchQueryResults) {
                    const totalResultCount = searchQueryResult.content.length;
                    const verifiedResultCount =
                        searchQueryResult.content.filter(
                            (c) => c.verification !== null,
                        ).length;
                    const topResultVerified =
                        verifiedResultCount > 0 && totalResultCount > 0;
                    trackCoverage({
                        searchQuery: searchQueryResult.searchQuery,
                        totalResultCount,
                        verifiedResultCount,
                        topResultVerified,
                    });
                }

                return {
                    result: (
                        <searchresults>
                            {searchQueryResults.map((searchQueryResult) =>
                                renderContent(
                                    searchQueryResult,
                                    siteUrl,
                                    toolDescriptionMaxChars,
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
        toModelOutput: ({ output }) => toModelOutput(output),
    });
