import {
    assertUnreachable,
    ContentVerificationInfo,
    findContentToolDefinition,
    getFindContentToolDescription,
    type ToolFindContentStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import moment from 'moment';
import type { AiAgentFindContentCoverage } from '../../../../analytics/LightdashAnalytics';
import type {
    FindContentChartResult,
    FindContentDashboardResult,
    FindContentDataAppResult,
    FindContentFn,
    FindContentResult,
    FindContentSpaceMetadata,
    FindContentSpaceResult,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { DASHBOARD_CHARTS_PREVIEW_COUNT, truncate } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';

type SearchResult = ToolFindContentStructuredContent['searchResults'][number];
type ContentItem = SearchResult['content'][number];
type ContentItemOf<T extends ContentItem['contentType']> = Extract<
    ContentItem,
    { contentType: T }
>;
type SpaceMetadata = ContentItemOf<'space'>['space'];
type Verification = ContentItemOf<'chart'>['verification'];

const NO_VERIFIED_CONTENT_NOTE =
    'No verified content matched this query. Verified content may still exist under other search terms; re-run with verifiedOnly=false only if unverified content is acceptable.';

type Dependencies = {
    findContent: FindContentFn;
    siteUrl: string;
    toolDescriptionMaxChars: number;
    trackCoverage: (coverage: AiAgentFindContentCoverage) => void;
    dashboardDetailsToolName: 'getDashboardCharts' | 'readContent';
};

const toolDefinition = findContentToolDefinition.for('agent');

const fullName = (user: { firstName: string; lastName: string }) =>
    `${user.firstName} ${user.lastName}`;

const verifiedFirst = <T extends { verification: unknown }>(items: T[]) =>
    [...items].sort(
        (a, b) =>
            Number(b.verification !== null) - Number(a.verification !== null),
    );

const toDescription = (
    description: string | null | undefined,
    toolDescriptionMaxChars: number,
) => (description ? truncate(description, toolDescriptionMaxChars) : null);

const toVerification = (
    verification: ContentVerificationInfo | null,
): Verification =>
    verification
        ? {
              verifiedBy: fullName(verification.verifiedBy),
              verifiedAt: new Date(verification.verifiedAt).toISOString(),
          }
        : null;

// Search rows carry timestamps as Date objects despite their string type.
const toTimestamp = (timestamp: string | null): string | null =>
    timestamp ? new Date(timestamp).toISOString() : null;

const toSpaceMetadata = (space: FindContentSpaceMetadata): SpaceMetadata => ({
    uuid: space.uuid,
    name: space.name,
    slug: space.slug,
    breadcrumb: space.breadcrumbs.map((item) => item.name).join(' / '),
});

const toSpaceItem = (
    space: FindContentSpaceResult,
): ContentItemOf<'space'> => ({
    contentType: 'space',
    uuid: space.uuid,
    name: space.name,
    slug: space.slug,
    searchRank: space.search_rank,
    chartCount: space.chartCount,
    dashboardCount: space.dashboardCount,
    childSpaceCount: space.childSpaceCount,
    appCount: space.appCount,
    directAccess: space.directAccess,
    space: toSpaceMetadata(space.space),
});

const chartHref = (chart: FindContentChartResult, siteUrl: string) => {
    switch (chart.chartSource) {
        case 'saved':
            return `${siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view#chart-link#chart-type-${chart.chartType}`;
        case 'sql':
            return `${siteUrl}/projects/${chart.projectUuid}/sql-runner/${chart.slug}#chart-link#chart-type-${chart.chartType}`;
        default:
            return assertUnreachable(chart.chartSource, 'Unknown chart source');
    }
};

const toChartItem = (
    chart: FindContentChartResult,
    siteUrl: string,
    toolDescriptionMaxChars: number,
): ContentItemOf<'chart'> => ({
    contentType: 'chart',
    uuid: chart.uuid,
    name: chart.name,
    slug: chart.slug,
    searchRank: chart.search_rank,
    chartType: chart.chartType,
    chartSource: chart.chartSource,
    spaceUuid: chart.spaceUuid,
    viewsCount: chart.viewsCount,
    href: chartHref(chart, siteUrl),
    space: toSpaceMetadata(chart.space),
    description: toDescription(chart.description, toolDescriptionMaxChars),
    verification: toVerification(chart.verification),
    firstViewedAt: toTimestamp(chart.firstViewedAt),
    lastModified: toTimestamp(chart.lastModified),
    createdBy: chart.createdBy ? fullName(chart.createdBy) : null,
    lastUpdatedBy: chart.lastUpdatedBy ? fullName(chart.lastUpdatedBy) : null,
});

const toDashboardItem = (
    dashboard: FindContentDashboardResult,
    siteUrl: string,
    toolDescriptionMaxChars: number,
): ContentItemOf<'dashboard'> => ({
    contentType: 'dashboard',
    uuid: dashboard.uuid,
    name: dashboard.name,
    slug: dashboard.slug,
    searchRank: dashboard.search_rank,
    spaceUuid: dashboard.spaceUuid,
    viewsCount: dashboard.viewsCount,
    href: `${siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view#dashboard-link`,
    space: toSpaceMetadata(dashboard.space),
    description: toDescription(dashboard.description, toolDescriptionMaxChars),
    verification: toVerification(dashboard.verification),
    firstViewedAt: toTimestamp(dashboard.firstViewedAt),
    lastModified: toTimestamp(dashboard.lastModified),
    createdBy: dashboard.createdBy ? fullName(dashboard.createdBy) : null,
    lastUpdatedBy: dashboard.lastUpdatedBy
        ? fullName(dashboard.lastUpdatedBy)
        : null,
    charts: {
        count: dashboard.charts.length,
        preview: verifiedFirst(dashboard.charts)
            .slice(0, DASHBOARD_CHARTS_PREVIEW_COUNT)
            .map((chart) => ({
                uuid: chart.uuid,
                name: chart.name,
                chartType: chart.chartType,
                description: toDescription(
                    chart.description,
                    toolDescriptionMaxChars,
                ),
                verification: toVerification(chart.verification),
            })),
    },
    validationErrorCount: dashboard.validationErrors.length,
});

const toDataAppItem = (
    dataApp: FindContentDataAppResult,
    siteUrl: string,
    toolDescriptionMaxChars: number,
): ContentItemOf<'data_app'> => ({
    contentType: 'data_app',
    uuid: dataApp.uuid,
    name: dataApp.name,
    slug: dataApp.slug,
    searchRank: dataApp.search_rank,
    spaceUuid: dataApp.spaceUuid,
    viewsCount: dataApp.viewsCount,
    href: `${siteUrl}/projects/${dataApp.projectUuid}/apps/${dataApp.uuid}/view`,
    space: dataApp.space ? toSpaceMetadata(dataApp.space) : null,
    description: toDescription(dataApp.description, toolDescriptionMaxChars),
    createdBy: dataApp.createdBy ? fullName(dataApp.createdBy) : null,
});

const toContentItem = (
    content: FindContentResult,
    siteUrl: string,
    toolDescriptionMaxChars: number,
): ContentItem => {
    switch (content.contentType) {
        case 'document':
            return {
                contentType: 'document',
                uuid: content.uuid,
                name: content.name,
                slug: content.slug,
                href: content.href,
                description: toDescription(
                    content.description,
                    toolDescriptionMaxChars,
                ),
            };
        case 'space':
            return toSpaceItem(content);
        case 'data_app':
            return toDataAppItem(content, siteUrl, toolDescriptionMaxChars);
        case 'dashboard':
            return toDashboardItem(content, siteUrl, toolDescriptionMaxChars);
        case 'chart':
            return toChartItem(content, siteUrl, toolDescriptionMaxChars);
        default:
            return assertUnreachable(content, 'Unknown content type');
    }
};

const toSearchResult = (
    args: Awaited<ReturnType<FindContentFn>> & {
        searchQuery: string;
        verifiedOnly: boolean;
    },
    siteUrl: string,
    toolDescriptionMaxChars: number,
): SearchResult => {
    const content = verifiedFirst(args.content).map((item) =>
        toContentItem(item, siteUrl, toolDescriptionMaxChars),
    );
    return {
        searchQuery: args.searchQuery,
        verifiedOnly: args.verifiedOnly,
        count: content.length,
        note:
            args.verifiedOnly && content.length === 0
                ? NO_VERIFIED_CONTENT_NOTE
                : null,
        content,
    };
};

const renderVerified = (verification: Verification) =>
    verification ? (
        <verified
            by={verification.verifiedBy}
            at={moment(verification.verifiedAt).fromNow()}
        />
    ) : null;

const renderSpaceMetadata = (space: SpaceMetadata) => (
    <space
        uuid={space.uuid}
        name={space.name}
        slug={space.slug}
        breadcrumb={space.breadcrumb}
    />
);

const renderSpace = (space: ContentItemOf<'space'>) => (
    <spaceResult
        spaceUuid={space.uuid}
        slug={space.slug}
        searchRank={space.searchRank}
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

const renderChart = (chart: ContentItemOf<'chart'>) => (
    <chart
        chartUuid={chart.uuid}
        slug={chart.slug}
        searchRank={chart.searchRank}
        chartType={chart.chartType}
        chartSource={chart.chartSource}
        spaceUuid={chart.spaceUuid}
        viewsCount={chart.viewsCount}
        href={chart.href}
    >
        <name>{chart.name}</name>
        {renderSpaceMetadata(chart.space)}
        {chart.description !== null && (
            <description>{chart.description}</description>
        )}
        {renderVerified(chart.verification)}
        {chart.firstViewedAt && (
            <firstviewedat>
                {moment(chart.firstViewedAt).fromNow()}
            </firstviewedat>
        )}
        {chart.lastModified && (
            <lastmodified>{moment(chart.lastModified).fromNow()}</lastmodified>
        )}
        {chart.createdBy && <createdby>{chart.createdBy}</createdby>}
        {chart.lastUpdatedBy && (
            <lastupdatedby>{chart.lastUpdatedBy}</lastupdatedby>
        )}
    </chart>
);

const renderDashboard = (dashboard: ContentItemOf<'dashboard'>) => (
    <dashboard
        dashboardUuid={dashboard.uuid}
        slug={dashboard.slug}
        spaceUuid={dashboard.spaceUuid}
        viewCount={dashboard.viewsCount}
        href={dashboard.href}
    >
        <name>{dashboard.name}</name>
        <searchrank>{dashboard.searchRank}</searchrank>
        {renderSpaceMetadata(dashboard.space)}

        {dashboard.description !== null && (
            <description>{dashboard.description}</description>
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
        {dashboard.createdBy && <createdby>{dashboard.createdBy}</createdby>}
        {dashboard.lastUpdatedBy && (
            <lastupdatedby>{dashboard.lastUpdatedBy}</lastupdatedby>
        )}
        <charts count={dashboard.charts.count}>
            {dashboard.charts.preview.map((chart) => (
                <chart chartUuid={chart.uuid} chartType={chart.chartType}>
                    <name>{chart.name}</name>
                    {chart.description !== null && (
                        <description>{chart.description}</description>
                    )}
                    {renderVerified(chart.verification)}
                </chart>
            ))}
        </charts>
        {dashboard.validationErrorCount > 0 ? (
            <validationerrors count={dashboard.validationErrorCount} />
        ) : null}
    </dashboard>
);

const renderDataApp = (dataApp: ContentItemOf<'data_app'>) => (
    <dataApp
        dataAppUuid={dataApp.uuid}
        slug={dataApp.slug}
        searchRank={dataApp.searchRank}
        spaceUuid={dataApp.spaceUuid}
        viewsCount={dataApp.viewsCount}
        href={dataApp.href}
    >
        <name>{dataApp.name}</name>
        {dataApp.space && renderSpaceMetadata(dataApp.space)}
        {dataApp.description !== null && (
            <description>{dataApp.description}</description>
        )}
        {dataApp.createdBy && <createdby>{dataApp.createdBy}</createdby>}
    </dataApp>
);

const renderContentItem = (content: ContentItem) => {
    switch (content.contentType) {
        case 'document':
            return (
                <document
                    uuid={content.uuid}
                    name={content.name}
                    slug={content.slug}
                    href={content.href}
                >
                    {content.description}
                </document>
            );
        case 'space':
            return renderSpace(content);
        case 'data_app':
            return renderDataApp(content);
        case 'dashboard':
            return renderDashboard(content);
        case 'chart':
            return renderChart(content);
        default:
            return assertUnreachable(content, 'Unknown content type');
    }
};

const renderSearchResult = (searchResult: SearchResult) => (
    <searchresult searchQuery={searchResult.searchQuery}>
        {searchResult.note}
        {searchResult.content.map(renderContentItem)}
    </searchresult>
);

export const getFindContent = ({
    findContent,
    siteUrl,
    toolDescriptionMaxChars,
    trackCoverage,
    dashboardDetailsToolName,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        description: getFindContentToolDescription({
            toolName: toolDefinition.name,
            dashboardDetailsToolName,
        }),
        execute: async (
            args,
        ): Promise<
            | ExecuteStructuredToolResult<ToolFindContentStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const verifiedOnly = args.verifiedOnly ?? false;
                const searchQueryResults = await Promise.all(
                    args.searchQueries.map(async (searchQuery) => ({
                        searchQuery: searchQuery.label,
                        verifiedOnly,
                        ...(await findContent({
                            searchQuery,
                            spaceSlug: args.spaceSlug ?? null,
                            verifiedOnly,
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
                        verifiedOnly,
                    });
                }

                const structuredContent: ToolFindContentStructuredContent = {
                    searchResults: searchQueryResults.map((searchQueryResult) =>
                        toSearchResult(
                            searchQueryResult,
                            siteUrl,
                            toolDescriptionMaxChars,
                        ),
                    ),
                };

                return {
                    result: (
                        <searchresults>
                            {structuredContent.searchResults.map(
                                renderSearchResult,
                            )}
                        </searchresults>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error finding content for search queries: ${args.searchQueries
                        .map((q) => q.label)
                        .join(', ')}`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
