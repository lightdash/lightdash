import {
    AdditionalMetric,
    AiArtifact,
    AiMetricQueryWithFilters,
    AiWebAppPrompt,
    AllChartsSearchResult,
    AnyType,
    CacheMetadata,
    CatalogField,
    CatalogTable,
    DashboardSearchResult,
    Explore,
    Filters,
    ItemsMap,
    KnexPaginateArgs,
    SlackPrompt,
    ToolFindChartsArgs,
    ToolFindDashboardsArgs,
    ToolFindFieldsArgs,
    UpdateSlackResponse,
    UpdateWebAppResponse,
} from '@lightdash/common';
import { AiAgentResponseStreamed } from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';

type Pagination = KnexPaginateArgs & {
    totalPageCount: number;
    totalResults: number;
};

export type ListExploresFn = (args: KnexPaginateArgs) => Promise<{
    tables: CatalogTable[];
    pagination: Pagination;
}>;

export type InspectExploreFn = (
    args: { tableName: string } & KnexPaginateArgs,
) => Promise<{
    table: CatalogTable;
    dimensions?: CatalogField[];
    metrics?: CatalogField[];
    dimensionsPagination?: Pagination;
    metricsPagination?: Pagination;
}>;

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
    },
) => Promise<{
    fields: CatalogField[];
    pagination: Pagination | undefined;
}>;

export type FindDashboardsFn = (
    args: KnexPaginateArgs & {
        dashboardSearchQuery: ToolFindDashboardsArgs['dashboardSearchQueries'][number];
    },
) => Promise<{
    dashboards: DashboardSearchResult[];
    pagination: Pagination | undefined;
}>;

export type FindChartsFn = (
    args: KnexPaginateArgs & {
        chartSearchQuery: ToolFindChartsArgs['chartSearchQueries'][number];
    },
) => Promise<{
    charts: AllChartsSearchResult[];
    pagination: Pagination | undefined;
}>;

export type GetExploreFn = (args: { exploreName: string }) => Promise<Explore>;

export type UpdateProgressFn = (progress: string) => Promise<void>;

export type GetPromptFn = () => Promise<SlackPrompt | AiWebAppPrompt>;

export type RunMiniMetricQueryFn = (
    metricQuery: AiMetricQueryWithFilters,
    maxLimit: number,
    additionalMetrics?: AdditionalMetric[],
) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type SendFileFn = (args: PostSlackFile) => Promise<void>;

export type UpdatePromptFn = (
    prompt: UpdateWebAppResponse | UpdateSlackResponse,
) => Promise<void>;

export type StoreToolCallFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    toolArgs: object;
}) => Promise<void>;

export type StoreToolResultsFn = (
    data: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        result: string;
    }>,
) => Promise<void>;

export type TrackEventFn = (event: AiAgentResponseStreamed) => void;

export type SearchFieldValuesFn = (args: {
    table: string;
    fieldId: string;
    query: string;
    filters?: Filters;
}) => Promise<string[]>;

export type CreateOrUpdateArtifactFn = (data: {
    threadUuid: string;
    promptUuid: string;
    artifactType: 'chart' | 'dashboard';
    title?: string;
    description?: string;
    vizConfig: Record<string, unknown>;
}) => Promise<AiArtifact>;

export type CheckUserPermissionFn = (args: {
    userId: string;
    organizationId: string;
    permission: string;
}) => Promise<boolean>;

export type AppendInstructionFn = (args: {
    projectUuid: string;
    agentUuid: string;
    instruction: string;
    metadata?: {
        originalQuery: string;
        incorrectResponse: string;
        correctResponse: string;
        category: string;
        confidence: number;
        createdByUserId: string;
        createdAt: string;
    };
}) => Promise<string>; // Returns instruction ID
