import {
    AdditionalMetric,
    AgentToolOutput,
    AiAgentDocumentContent,
    AiAgentDocumentSummary,
    AiArtifact,
    AiMetricQueryWithFilters,
    AiWebAppPrompt,
    AiWritebackRunResult,
    AllChartsSearchResult,
    AnyType,
    CacheMetadata,
    CatalogField,
    ChartAsCode,
    CreateChangeParams,
    DashboardAsCode,
    DashboardSearchResult,
    DbtProjectType,
    Explore,
    ExploreCompiler,
    Filters,
    ItemsMap,
    KnexPaginateArgs,
    ParametersValuesMap,
    PreviewDeploySecret,
    ProjectType,
    SavedChart,
    SlackPrompt,
    ToolFindContentArgs,
    ToolFindFieldsArgs,
    ToolListContentArgs,
    UpdateSlackResponse,
    UpdateWebAppResponse,
    WarehouseTablesCatalog,
    WarehouseTypes,
} from '@lightdash/common';
import {
    AiAgentFindContentCoverageEvent,
    AiAgentResponseStreamed,
    AiAgentToolCallEvent,
} from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';
import { AiAgentSkill } from '../skills/types';

type Pagination = KnexPaginateArgs & {
    totalPageCount: number;
    totalResults: number;
};

export type ListExploresFn = () => Promise<Explore[]>;

export type FindExploresFn = (args: {
    fieldSearchSize: number;
    searchQuery?: string;
}) => Promise<{
    exploreSearchResults?: Array<{
        name: string;
        label: string;
        description?: string;
        aiHints?: string[];
        searchRank?: number;
        joinedTables?: string[] | null;
    }>;
    topMatchingFields?: Array<{
        name: string;
        label: string;
        tableName: string;
        fieldType: string;
        searchRank?: number;
        description?: string;
        chartUsage?: number;
        verifiedChartUsage?: number;
    }>;
}>;

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
        explore: Explore;
    },
) => Promise<{
    fields: CatalogField[];
    pagination: Pagination | undefined;
}>;

export type GetExploreFn = (args: { table: string }) => Promise<Explore>;

export type FindContentFn = (args: {
    searchQuery: ToolFindContentArgs['searchQueries'][number];
}) => Promise<{
    content: (AllChartsSearchResult | DashboardSearchResult)[];
}>;

export type ListContentFn = (args: {
    spaceSlug: string | null;
    page: NonNullable<ToolListContentArgs['page']>;
}) => Promise<{
    spaceSlug: string | null;
    items: Array<
        | {
              contentType: 'chart' | 'dashboard' | 'data_app';
              name: string;
              slug: string;
          }
        | {
              contentType: 'space';
              name: string;
              slug: string;
              chartCount: number;
              dashboardCount: number;
              childSpaceCount: number;
              appCount: number;
              directAccess: boolean;
          }
    >;
    pagination:
        | {
              page: number;
              pageSize: number;
              totalResults: number;
              totalPageCount: number;
          }
        | undefined;
}>;

export type GetDashboardChartsFn = (args: {
    dashboardUuid: string;
    page: number;
    pageSize: number;
}) => Promise<{
    dashboardName: string;
    charts: DashboardSearchResult['charts'];
    pagination: {
        page: number;
        pageSize: number;
        totalResults: number;
        totalPageCount: number;
    };
}>;

export type ReadContentFn = (args: {
    slug: string;
    type: 'dashboard' | 'chart';
}) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          href: string;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          href: string;
      }
>;

export type EditContentFn = (args: {
    slug: string;
    type: 'dashboard' | 'chart';
    patch: unknown;
}) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          uuid: string;
          href: string;
          versionUuids: {
              before: string | null;
              after: string | null;
          };
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          uuid: string;
          href: string;
          versionUuids: {
              before: string | null;
              after: string | null;
          };
      }
>;

type CreateContentArgs =
    | {
          type: 'dashboard';
          content: DashboardAsCode;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
      };

export type CreateContentFn = (args: CreateContentArgs) => Promise<
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          uuid: string;
          href: string;
      }
    | {
          type: 'chart';
          content: ChartAsCode;
          uuid: string;
          href: string;
      }
>;

export type ValidateContentFn = (args: CreateContentArgs) => void;

export type UpdateProgressFn = (
    progress: string,
    // The tool the progress belongs to. Web step-progress rendering uses this
    // to scope an inline progress row to the active tool, so a concurrently
    // running tool's message can't surface under another tool's header. Slack
    // ignores it (single pinned message). Omitted by tools that don't need
    // attribution.
    toolName?: string,
) => Promise<void>;

export type GetPromptFn = () => Promise<SlackPrompt | AiWebAppPrompt>;

export type RunAsyncQueryFn = (
    metricQuery: AiMetricQueryWithFilters,
    additionalMetrics?: AdditionalMetric[],
    parameters?: ParametersValuesMap,
) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type RunSavedChartQueryFn = (args: {
    chartUuid: string;
    dashboardSlug: string | null;
    limit: number | null;
}) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type GetSavedChartFn = (chartUuidOrSlug: string) => Promise<SavedChart>;

export type SendFileFn = (args: PostSlackFile) => Promise<void>;

export type SendSlackBlocksFn = (args: {
    channelId: string;
    threadTs: string;
    organizationUuid: string;
    text: string;
    blocks: AnyType[];
}) => Promise<{ ts: string }>;

export type UpdateSlackMessageFn = (args: {
    channelId: string;
    organizationUuid: string;
    ts: string;
    text: string;
    blocks: AnyType[];
}) => Promise<void>;

export type UpdatePromptFn = (
    prompt: UpdateWebAppResponse | UpdateSlackResponse,
) => Promise<void>;

export type StoreToolCallFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    toolArgs: object;
    mcpServerUuid?: string | null;
    parentToolCallId: string | null;
}) => Promise<void>;

export type StoreToolResultsFn = (
    data: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        result: string;
        metadata?: AgentToolOutput['metadata'] | Record<string, unknown> | null;
    }>,
) => Promise<void>;

export type StoreReasoningFn = (
    promptUuid: string,
    reasonings: Array<{
        reasoningId: string;
        text: string;
    }>,
) => Promise<void>;

export type TrackEventFn = (
    event:
        | AiAgentResponseStreamed
        | AiAgentToolCallEvent
        | AiAgentFindContentCoverageEvent,
) => void;

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

export type CreateChangeFn = (
    params: Pick<
        CreateChangeParams,
        'type' | 'entityName' | 'entityType' | 'entityTableName' | 'payload'
    >,
) => Promise<string>;

export type GetExploreCompilerFn = () => Promise<ExploreCompiler>;

export type RunSqlJobFn = (args: { sql: string; limit: number }) => Promise<{
    rows: Record<string, AnyType>[];
    columns: string[];
    rowCount: number;
}>;

export type ListWarehouseTablesFn = () => Promise<WarehouseTablesCatalog>;

export type DescribeWarehouseTableFn = (args: {
    table: string;
    schema?: string;
}) => Promise<{
    columns: Array<{ name: string; type: string }>;
    resolvedSchema: string | null;
}>;

export type ListKnowledgeDocumentsFn = () => Promise<AiAgentDocumentSummary[]>;

export type GetKnowledgeDocumentContentFn = (args: {
    documentUuid: string;
}) => Promise<AiAgentDocumentContent>;

export type WaitForSqlApprovalFn = (
    toolCallId: string,
    timeoutMs?: number,
) => Promise<'approved' | 'rejected' | 'timeout'>;

export type RecordSqlApprovalFn = (
    toolCallId: string,
    decision: 'approved' | 'rejected',
    decidedByUserUuid: string | null,
) => Promise<boolean>;

export type LoadAgentSkillFn = (
    name: string,
) => Promise<AiAgentSkill | undefined>;

export type ProposeWritebackFn = (args: {
    prompt: string;
}) => Promise<AiWritebackRunResult>;

export type SetupPreviewDeployFn = () => Promise<
    AiWritebackRunResult & { secrets: PreviewDeploySecret[] }
>;

export type ListProjectsFn = () => Promise<
    {
        projectUuid: string;
        name: string;
        type: ProjectType;
        isActive: boolean;
    }[]
>;

// Safe, non-sensitive snapshot of the active project's dbt + warehouse setup.
// Deliberately excludes any credentials (tokens, keys, installation ids) and
// dbt environment variables, which can hold secrets.
export type GetProjectInfoFn = () => Promise<{
    projectName: string;
    projectType: ProjectType;
    dbtConnectionType: DbtProjectType;
    dbtVersion: string;
    warehouseType: WarehouseTypes | null;
    git: {
        repository: string;
        branch: string;
        projectSubPath: string;
        hostDomain: string | null;
    } | null;
}>;
