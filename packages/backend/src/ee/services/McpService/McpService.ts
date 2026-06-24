import { subject } from '@casl/ability';
import {
    Account,
    AiAgentWithContext,
    AiResultType,
    ApiKeyAccount,
    assertUnreachable,
    buildRunSqlDescription,
    ChartType,
    clearAgentToolDefinition,
    CommercialFeatureFlags,
    convertAiTableCalcsSchemaToTableCalcs,
    convertFieldRefToFieldId,
    createContentToolDefinition,
    createMcpCompatibleInputShape,
    createToolRunSqlArgsSchema,
    editContentToolDefinition,
    Explore,
    FeatureFlags,
    findContentToolDefinition,
    findExploresToolDefinition,
    findFieldsToolDefinition,
    ForbiddenError,
    getCurrentAgentToolDefinition,
    getCurrentProjectToolDefinition,
    getFieldsToolDefinition,
    getItemLabelWithoutTableName,
    getItemMap,
    getLightdashVersionToolDefinition,
    getQueryResultToolDefinition,
    getSlackAiEchartsConfig,
    getTotalFilterRules,
    getValidAiQueryLimit,
    ItemsMap,
    listAgentsToolDefinition,
    listContentToolDefinition,
    listExploresToolDefinition,
    listSkillsToolDefinition,
    listVerifiedContentToolDefinition,
    MCP_QUERY_POLL_INTERVAL_MS,
    MCP_QUERY_SYNC_WAIT_MS,
    mcpListProjectsToolDefinition,
    MetricQuery,
    MissingConfigError,
    NotFoundError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    readContentToolDefinition,
    readSkillResourceToolDefinition,
    readSkillToolDefinition,
    renderChartToolDefinition,
    routeAgentToolDefinition,
    runAiWritebackToolDefinition,
    runQueryToolDefinition,
    runSqlToolDefinition,
    searchFieldValuesToolDefinition,
    ServiceAcctAccount,
    SessionUser,
    setAgentToolDefinition,
    setProjectToolDefinition,
    toolRenderChartArgsSchemaTransformed,
    ToolRenderChartArgsTransformed,
    toolRunQueryArgsSchemaTransformed,
    ToolRunQueryArgsTransformed,
    UnexpectedServerError,
    UserAttributeValueMap,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/extensions
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
    ServerNotification,
    ServerRequest,
    // eslint-disable-next-line import/extensions
} from '@modelcontextprotocol/sdk/types.js';
import * as Sentry from '@sentry/node';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import {
    LightdashAnalytics,
    McpToolCallEvent,
} from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { McpContextModel } from '../../../models/McpContextModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../../models/SearchModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { ContentVerificationService } from '../../../services/ContentVerificationService';
import { CsvService } from '../../../services/CsvService/CsvService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { ShareService } from '../../../services/ShareService/ShareService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import {
    mergeUserAttributes,
    validateUserAttributeOverrides,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
import { VERSION } from '../../../version';
import {
    getMcpAnalystPromptWithContext,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { getCreateContent } from '../ai/tools/createContent';
import { getEditContent } from '../ai/tools/editContent';
import { getFindContent } from '../ai/tools/findContent';
import { getFindExplores } from '../ai/tools/findExplores';
import { getFindFields } from '../ai/tools/findFields';
import { getGetFields } from '../ai/tools/getFields';
import { getListContent } from '../ai/tools/listContent';
import { getMcpListExplores } from '../ai/tools/mcpListExplores';
import { getReadContent } from '../ai/tools/readContent';
import { validateRunQueryTool } from '../ai/tools/runQuery';
import { getSearchFieldValues } from '../ai/tools/searchFieldValues';
import { getPivotedResults } from '../ai/utils/getPivotedResults';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { AiAgentService } from '../AiAgentService/AiAgentService';
import {
    AiAgentToolsRuntime,
    AiAgentToolsService,
} from '../AiAgentToolsService/AiAgentToolsService';
import { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import { AiRouterService } from '../AiRouterService/AiRouterService';
import { AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { buildMcpExploreConfigState } from './buildMcpExploreConfigState';
import {
    registerAppResource,
    registerAppTool,
    RESOURCE_MIME_TYPE,
} from './mcpAppHelpers';

export enum McpToolName {
    GET_LIGHTDASH_VERSION = 'get_lightdash_version',
    LIST_EXPLORES = 'list_explores',
    FIND_EXPLORES = 'find_explores',
    FIND_FIELDS = 'find_fields',
    GET_FIELDS = 'get_fields',
    FIND_CONTENT = 'find_content',
    LIST_CONTENT = 'list_content',
    READ_CONTENT = 'read_content',
    CREATE_CONTENT = 'create_content',
    EDIT_CONTENT = 'edit_content',
    LIST_PROJECTS = 'list_projects',
    SET_PROJECT = 'set_project',
    GET_CURRENT_PROJECT = 'get_current_project',
    LIST_AGENTS = 'list_agents',
    ROUTE_AGENT = 'route_agent',
    SET_AGENT = 'set_agent',
    CLEAR_AGENT = 'clear_agent',
    GET_CURRENT_AGENT = 'get_current_agent',
    RUN_METRIC_QUERY = 'run_metric_query',
    RENDER_CHART = 'render_chart',
    RUN_SQL = 'run_sql',
    GET_QUERY_RESULT = 'get_query_result',
    SEARCH_FIELD_VALUES = 'search_field_values',
    LIST_VERIFIED_CONTENT = 'list_verified_content',
    RUN_AI_WRITEBACK = 'run_ai_writeback',
    LIST_SKILLS = 'list_skills',
    READ_SKILL = 'read_skill',
    READ_SKILL_RESOURCE = 'read_skill_resource',
}

// Skills-over-MCP extension identifier (SEP-2640).
const MCP_SKILLS_EXTENSION_NAME = 'io.modelcontextprotocol/skills';

const mcpRunAiWritebackTool = runAiWritebackToolDefinition.for('mcp');
const mcpGetLightdashVersionTool = getLightdashVersionToolDefinition.for('mcp');
const mcpListExploresTool = listExploresToolDefinition.for('mcp');
const mcpFindExploresTool = findExploresToolDefinition.for('mcp');
const mcpFindFieldsTool = findFieldsToolDefinition.for('mcp');
const mcpGetFieldsTool = getFieldsToolDefinition.for('mcp');
const mcpFindContentTool = findContentToolDefinition.for('mcp');
const mcpListContentTool = listContentToolDefinition.for('mcp');
const mcpReadContentTool = readContentToolDefinition.for('mcp');
const mcpCreateContentTool = createContentToolDefinition.for('mcp');
const mcpEditContentTool = editContentToolDefinition.for('mcp');
const mcpListProjectsTool = mcpListProjectsToolDefinition.for('mcp');
const mcpSetProjectTool = setProjectToolDefinition.for('mcp');
const mcpGetCurrentProjectTool = getCurrentProjectToolDefinition.for('mcp');
const mcpListAgentsTool = listAgentsToolDefinition.for('mcp');
const mcpRouteAgentTool = routeAgentToolDefinition.for('mcp');
const mcpSetAgentTool = setAgentToolDefinition.for('mcp');
const mcpClearAgentTool = clearAgentToolDefinition.for('mcp');
const mcpGetCurrentAgentTool = getCurrentAgentToolDefinition.for('mcp');
const mcpRunMetricQueryTool = runQueryToolDefinition.for('mcp');
const mcpRenderChartTool = renderChartToolDefinition.for('mcp');
const mcpSearchFieldValuesTool = searchFieldValuesToolDefinition.for('mcp');
const mcpRunSqlTool = runSqlToolDefinition.for('mcp');
const mcpGetQueryResultTool = getQueryResultToolDefinition.for('mcp');
const mcpListVerifiedContentTool = listVerifiedContentToolDefinition.for('mcp');
const mcpListSkillsTool = listSkillsToolDefinition.for('mcp');
const mcpReadSkillTool = readSkillToolDefinition.for('mcp');
const mcpReadSkillResourceTool = readSkillResourceToolDefinition.for('mcp');

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    contentVerificationService: ContentVerificationService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    shareService: ShareService;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    spaceService: SpaceService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
    aiAgentService: AiAgentService;
    aiAgentToolsService: AiAgentToolsService;
    aiRouterService: AiRouterService;
    aiWritebackService: AiWritebackService;
};

export type ExtraContext = {
    user: SessionUser;
    account: OauthAccount | ApiKeyAccount | ServiceAcctAccount;
    /** User attribute overrides passed via X-Lightdash-User-Attributes header */
    headerUserAttributes?: UserAttributeValueMap;
    /** Project UUID passed via X-Lightdash-Project header; overrides stored context */
    headerProjectUuid?: string;
};

type McpEffectiveScope = {
    tags: string[] | null;
    spaceAccess: string[] | null;
    agentUuid: string | null;
    agentName: string | null;
};

// Narrows the SDK's loosely-typed `RequestHandlerExtra` into the shape the
// McpService methods expect. The MCP router (mcpRouter.ts) populates
// `authInfo.extra` with ExtraContext before the SDK invokes any tool
// callback; this parses that out so call sites don't need type casts.
// `z.custom<T>()` is used for types we don't want to mirror as Zod schemas —
// it asserts the type without runtime validation of the inner shape.
const extraContextSchema = z.object({
    user: z.custom<SessionUser>(),
    account: z.custom<OauthAccount | ApiKeyAccount | ServiceAcctAccount>(),
    headerUserAttributes: z.custom<UserAttributeValueMap>().optional(),
    headerProjectUuid: z.string().optional(),
});

const mcpProtocolContextSchema = z.object({
    authInfo: z
        .intersection(
            z.custom<AuthInfo>(),
            z.object({ extra: extraContextSchema }),
        )
        .optional(),
});

type McpProtocolContext = z.infer<typeof mcpProtocolContextSchema>;

const getMcpContext = (
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): McpProtocolContext => mcpProtocolContextSchema.parse(extra);

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private analytics: LightdashAnalytics;

    private asyncQueryService: AsyncQueryService;

    private catalogService: CatalogService;

    private contentVerificationService: ContentVerificationService;

    private projectService: ProjectService;

    private projectModel: ProjectModel;

    private userAttributesModel: UserAttributesModel;

    private searchModel: SearchModel;

    private spaceService: SpaceService;

    private mcpContextModel: McpContextModel;

    private shareService: ShareService;

    private featureFlagService: FeatureFlagService;

    private aiOrganizationSettingsService: AiOrganizationSettingsService;

    private aiAgentService: AiAgentService;

    private aiAgentToolsService: AiAgentToolsService;

    private aiRouterService: AiRouterService;

    private aiWritebackService: AiWritebackService;

    private mcpServer: McpServer;

    constructor({
        lightdashConfig,
        analytics,
        asyncQueryService,
        catalogService,
        contentVerificationService,
        projectService,
        shareService,
        userAttributesModel,
        searchModel,
        spaceService,
        projectModel,
        mcpContextModel,
        featureFlagService,
        aiOrganizationSettingsService,
        aiAgentService,
        aiAgentToolsService,
        aiRouterService,
        aiWritebackService,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.asyncQueryService = asyncQueryService;
        this.catalogService = catalogService;
        this.contentVerificationService = contentVerificationService;
        this.projectService = projectService;
        this.shareService = shareService;
        this.userAttributesModel = userAttributesModel;
        this.searchModel = searchModel;
        this.projectModel = projectModel;
        this.spaceService = spaceService;
        this.mcpContextModel = mcpContextModel;
        this.featureFlagService = featureFlagService;
        this.aiOrganizationSettingsService = aiOrganizationSettingsService;
        this.aiAgentService = aiAgentService;
        this.aiAgentToolsService = aiAgentToolsService;
        this.aiRouterService = aiRouterService;
        this.aiWritebackService = aiWritebackService;
        try {
            this.mcpServer = Sentry.wrapMcpServerWithSentry(
                new McpServer({
                    name: 'Lightdash MCP Server',
                    version: VERSION,
                    websiteUrl: this.lightdashConfig.siteUrl,
                    icons: [
                        {
                            src: `${this.lightdashConfig.siteUrl}/logo-icon.svg`,
                            mimeType: 'image/svg+xml',
                        },
                        {
                            src: `${this.lightdashConfig.siteUrl}/favicon-32x32.png`,
                            mimeType: 'image/png',
                            sizes: ['32x32'],
                        },
                        {
                            src: `${this.lightdashConfig.siteUrl}/apple-touch-icon.png`,
                            mimeType: 'image/png',
                            sizes: ['152x152'],
                        },
                    ],
                }),
            );
            this.setupHandlers();
        } catch (error) {
            this.logger.error('Error initializing MCP server:', error);
            throw error;
        }
    }

    private async getScopeInfo(
        context: McpProtocolContext,
        projectUuid?: string,
    ) {
        try {
            const metadata = await this.getEffectiveScopeFromContext(
                context,
                projectUuid,
            );
            return [
                metadata.agentName
                    ? `Active agent: ${metadata.agentName}`
                    : null,
                metadata.tags
                    ? `Filtered by tags: ${metadata.tags.join(', ')}`
                    : null,
            ]
                .filter(Boolean)
                .join('. ');
        } catch (error) {
            this.logger.warn('Failed to build MCP scope label', { error });
            return '';
        }
    }

    private async buildScopedResponse(
        context: McpProtocolContext,
        toolResult: string,
        structuredContent?: Record<string, unknown>,
        projectUuid?: string,
    ) {
        const scopeInfo = await this.getScopeInfo(context, projectUuid);

        const content = [{ type: 'text' as const, text: toolResult }];

        if (scopeInfo) {
            content.push({
                type: 'text',
                text: `[Scope: ${scopeInfo}]`,
            });
        }

        return structuredContent !== undefined
            ? { content, structuredContent }
            : { content };
    }

    private static buildAgentContextResponse(agent: AiAgentWithContext) {
        return {
            agentUuid: agent.uuid,
            agentName: agent.name,
            agentDescription: agent.description,
            agentTags: agent.tags,
            agentSpaceAccess: agent.spaceAccess,
            agentProjectUuid: agent.projectUuid,
            explores: agent.context.explores,
            verifiedQuestions: agent.context.verifiedQuestions,
            instruction: agent.context.instruction,
        };
    }

    private async setActiveAgentContext(
        user: SessionUser,
        organizationUuid: string,
        {
            projectUuid,
            projectName,
            agentUuid,
            agentName,
        }: {
            projectUuid: string;
            projectName: string;
            agentUuid: string;
            agentName: string;
        },
    ) {
        const existingContext = await this.mcpContextModel.getContext(
            user.userUuid,
            organizationUuid,
        );

        await this.mcpContextModel.setContext({
            userUuid: user.userUuid,
            organizationUuid,
            context: {
                projectUuid,
                projectName,
                tags: existingContext?.context.tags || null,
                agentUuid,
                agentName,
            },
        });
    }

    static async streamToolResult<T extends { result: string }>(
        result: T | AsyncIterable<T>,
    ) {
        if (Symbol.asyncIterator in result) {
            let out = '';
            for await (const chunk of result) {
                out += chunk.result;
            }
            return out;
        }
        return result.result;
    }

    private static getMcpQueryWaitMs(
        _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
    ) {
        // MCP SDK request timeouts are client-side RequestOptions and are not
        // exposed to server tool handlers. If a standard server-visible timeout
        // is added later, resolve it here and fall back to Lightdash's default.
        return MCP_QUERY_SYNC_WAIT_MS;
    }

    private static isQueryRunningStatus(status: QueryHistoryStatus) {
        return (
            status === QueryHistoryStatus.PENDING ||
            status === QueryHistoryStatus.QUEUED ||
            status === QueryHistoryStatus.EXECUTING
        );
    }

    private static getPollingStatus(status: QueryHistoryStatus) {
        switch (status) {
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                return 'running' as const;
            case QueryHistoryStatus.READY:
                return 'done' as const;
            case QueryHistoryStatus.ERROR:
                return 'error' as const;
            case QueryHistoryStatus.CANCELLED:
                return 'cancelled' as const;
            case QueryHistoryStatus.EXPIRED:
                return 'expired' as const;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }

    private static getRunningQueryResponse(queryUuid: string) {
        const heartbeatAt = new Date().toISOString();

        return {
            content: [
                {
                    type: 'text' as const,
                    text: `Query is still running. Poll get_query_result with queryUuid: ${queryUuid}. Last checked at ${heartbeatAt}.`,
                },
            ],
            structuredContent: {
                result: {
                    status: 'running' as const,
                    queryUuid,
                    nextPollAfterMs: MCP_QUERY_POLL_INTERVAL_MS,
                    heartbeatAt,
                },
            },
        };
    }

    private async buildMcpMetricQuery({
        ctx,
        projectUuid,
        queryTool,
    }: {
        ctx: McpProtocolContext;
        projectUuid: string;
        queryTool: ToolRunQueryArgsTransformed;
    }): Promise<{
        query: MetricQuery;
        userAttributeOverrides: UserAttributeValueMap | undefined;
    }> {
        const toolsRuntime = await this.getToolsRuntime(ctx, projectUuid);
        const explore = await toolsRuntime.getExplore({
            table: queryTool.queryConfig.exploreName,
        });

        // Full validation including groupBy, axis, and tableCalcs
        validateRunQueryTool(queryTool, explore);

        const maxLimit = this.lightdashConfig.ai.copilot.maxQueryLimit;

        const additionalMetrics = populateCustomMetricsSQL(
            queryTool.queryConfig.customMetrics,
            explore,
        );

        return {
            query: {
                exploreName: queryTool.queryConfig.exploreName,
                dimensions: queryTool.queryConfig.dimensions,
                metrics: expandMetricsWithPopAdditionalMetrics(
                    queryTool.queryConfig.metrics,
                    additionalMetrics,
                ),
                sorts: queryTool.queryConfig.sorts.map((sort) => ({
                    ...sort,
                    nullsFirst: sort.nullsFirst ?? undefined,
                })),
                limit: getValidAiQueryLimit(
                    queryTool.queryConfig.limit,
                    maxLimit,
                ),
                filters: queryTool.queryConfig.filters,
                additionalMetrics,
                tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                    queryTool.queryConfig.tableCalculations,
                ),
            },
            userAttributeOverrides:
                await this.getUserAttributeOverridesFromContext(ctx),
        };
    }

    private async getToolsRuntime(
        context: McpProtocolContext,
        projectUuid: string,
    ): Promise<AiAgentToolsRuntime> {
        const { user, account, organizationUuid } =
            McpService.getAccount(context);

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const effectiveScope = await this.getEffectiveScopeFromContext(
            context,
            projectUuid,
        );

        return this.aiAgentToolsService.createRuntime({
            user,
            account,
            organizationUuid,
            projectUuid,
            source: 'mcp',
            catalogSearchContext: CatalogSearchContext.MCP,
            defaultQueryExecutionContext:
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            tags: effectiveScope.tags,
            spaceAccess: effectiveScope.spaceAccess,
            userAttributeOverrides:
                await this.getUserAttributeOverridesFromContext(context),
            agentUuid: effectiveScope.agentUuid ?? undefined,
        });
    }

    private async assertMetricQueryInEffectiveScope({
        ctx,
        user,
        projectUuid,
        metricQuery,
    }: {
        ctx: McpProtocolContext;
        user: SessionUser;
        projectUuid: string;
        metricQuery: MetricQuery;
    }) {
        const toolsRuntime = await this.getToolsRuntime(ctx, projectUuid);
        const explore = await toolsRuntime.getExplore({
            table: metricQuery.exploreName,
        });
        McpService.assertMetricQueryFieldsInExplore(metricQuery, explore);
    }

    private static assertMetricQueryFieldsInExplore(
        metricQuery: MetricQuery,
        explore: Explore,
    ) {
        const filterFieldIds = getTotalFilterRules(metricQuery.filters).map(
            (rule) => rule.target.fieldId,
        );
        const additionalMetricFieldIds = (
            metricQuery.additionalMetrics ?? []
        ).flatMap((metric) => [
            metric.baseDimensionName
                ? `${metric.table}_${metric.baseDimensionName}`
                : null,
            metric.baseMetricId ?? null,
            metric.timeDimensionId ?? null,
            ...(metric.distinctKeys ?? []).map((fieldRef) =>
                convertFieldRefToFieldId(fieldRef, metric.table),
            ),
            ...(metric.filters ?? []).map((filter) =>
                convertFieldRefToFieldId(filter.target.fieldRef, metric.table),
            ),
        ]);

        const referencedFieldIds = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.sorts.map((sort) => sort.fieldId),
            ...filterFieldIds,
            ...(metricQuery.pivotDimensions ?? []),
            ...additionalMetricFieldIds,
        ].filter((fieldId): fieldId is string => !!fieldId);

        const itemMap = getItemMap(
            explore,
            metricQuery.additionalMetrics ?? [],
            metricQuery.tableCalculations ?? [],
            metricQuery.customDimensions ?? [],
        );
        referencedFieldIds.forEach((fieldId) => {
            if (!itemMap[fieldId]) {
                throw new NotFoundError(`Field not found: ${fieldId}`);
            }
        });
    }

    private static buildRenderChartQueryTool({
        renderTool,
        metricQuery,
    }: {
        renderTool: ToolRenderChartArgsTransformed;
        metricQuery: MetricQuery;
    }): ToolRunQueryArgsTransformed {
        return {
            title: renderTool.title,
            description: renderTool.description,
            queryConfig: {
                exploreName: metricQuery.exploreName,
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                sorts: metricQuery.sorts.map((sort) => ({
                    ...sort,
                    nullsFirst: sort.nullsFirst ?? null,
                })),
                limit: metricQuery.limit,
                customMetrics: null,
                tableCalculations: null,
                filters: metricQuery.filters,
            },
            chartConfig: renderTool.chartConfig,
        };
    }

    private async buildMetricExploreUrl({
        ctx,
        projectUuid,
        metricQuery,
        fieldsMap,
        columnOrder,
        queryTool,
    }: {
        ctx: McpProtocolContext;
        projectUuid: string;
        metricQuery: MetricQuery;
        fieldsMap: ItemsMap;
        columnOrder: string[];
        queryTool?: ToolRunQueryArgsTransformed;
    }) {
        try {
            const exploreConfigState = queryTool
                ? buildMcpExploreConfigState({
                      queryTool,
                      metricQuery,
                      fieldsMap,
                      columnOrder,
                  })
                : {
                      tableName: metricQuery.exploreName,
                      metricQuery,
                      tableConfig: {
                          columnOrder,
                      },
                      chartConfig: {
                          type: ChartType.TABLE,
                      },
                  };

            const explorePath = `/projects/${projectUuid}/tables/${metricQuery.exploreName}`;
            const exploreParams = `?create_saved_chart_version=${encodeURIComponent(
                JSON.stringify(exploreConfigState),
            )}&isExploreFromHere=true`;

            const { user } = McpService.getAccount(ctx);
            const shareUrl = await this.shareService.createShareUrl(
                user,
                explorePath,
                exploreParams,
            );
            return `${this.lightdashConfig.siteUrl}/share/${shareUrl.nanoid}`;
        } catch (error) {
            this.logger.warn('Failed to build MCP explore URL', { error });
            return null;
        }
    }

    private async buildSqlRunnerUrl({
        ctx,
        projectUuid,
        sql,
        limit,
    }: {
        ctx: McpProtocolContext;
        projectUuid: string;
        sql: string;
        limit?: number;
    }) {
        try {
            const sqlRunnerPath = `/projects/${projectUuid}/sql-runner`;
            const sqlRunnerParams = JSON.stringify({
                sqlRunnerState: {
                    projectUuid,
                    sql,
                    limit,
                },
                chartConfig: null,
            });

            const { user } = McpService.getAccount(ctx);
            const shareUrl = await this.shareService.createShareUrl(
                user,
                sqlRunnerPath,
                sqlRunnerParams,
            );
            return `${this.lightdashConfig.siteUrl}${sqlRunnerPath}?share=${shareUrl.nanoid}`;
        } catch (error) {
            this.logger.warn('Failed to build MCP SQL Runner URL', { error });
            return null;
        }
    }

    private async buildRenderChartResponse({
        ctx,
        queryUuid,
        projectUuid,
        queryTool,
        query,
        rows,
        fields,
    }: {
        ctx: McpProtocolContext;
        queryUuid: string;
        projectUuid: string;
        queryTool: ToolRunQueryArgsTransformed;
        query: MetricQuery;
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    }) {
        const fieldIds = rows[0] ? Object.keys(rows[0]) : Object.keys(fields);
        const exploreUrl = await this.buildMetricExploreUrl({
            ctx,
            projectUuid,
            metricQuery: query,
            fieldsMap: fields,
            columnOrder: fieldIds,
            queryTool,
        });

        if (rows.length === 0) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Result rendered for queryUuid: ${queryUuid}, but the query returned 0 rows.${
                            exploreUrl
                                ? ` Explore from here: ${exploreUrl}`
                                : ''
                        }`,
                    },
                ],
                structuredContent: {
                    result: {
                        status: 'done' as const,
                        queryUuid,
                        echartsOption: null,
                        exploreUrl,
                    },
                },
                _meta: {
                    result: {
                        rows: [],
                        fields,
                        echartsOption: null,
                        exploreUrl,
                    },
                },
            };
        }

        const echartsOption = await getSlackAiEchartsConfig({
            toolArgs: {
                type: AiResultType.QUERY_RESULT,
                tool: queryTool,
            },
            queryResults: {
                rows,
                fields,
            },
            getPivotedResults,
        });

        const mcpEchartsOption = echartsOption
            ? {
                  ...echartsOption,
                  animation: true,
                  backgroundColor: 'transparent',
                  tooltip: {
                      ...(typeof echartsOption.tooltip === 'object'
                          ? echartsOption.tooltip
                          : {}),
                      show: true,
                  },
              }
            : null;

        const scopeInfo = await this.getScopeInfo(ctx, projectUuid);

        const content = [
            {
                type: 'text' as const,
                text: `${mcpEchartsOption ? 'Chart' : 'Result table'} rendered for queryUuid: ${queryUuid}.${
                    exploreUrl ? ` Explore from here: ${exploreUrl}` : ''
                }`,
            },
        ];
        if (scopeInfo) {
            content.push({
                type: 'text' as const,
                text: `[Scope: ${scopeInfo}]`,
            });
        }

        return {
            content,
            structuredContent: {
                result: {
                    status: 'done' as const,
                    queryUuid,
                    echartsOption: mcpEchartsOption ? {} : null,
                    exploreUrl,
                },
            },
            _meta: {
                result: {
                    rows,
                    fields,
                    echartsOption: mcpEchartsOption,
                    exploreUrl,
                },
            },
        };
    }

    private static buildMetricQueryPollResult({
        queryUuid,
        rows,
        fields,
        exploreUrl,
    }: {
        queryUuid: string;
        rows: Record<string, unknown>[];
        fields: ItemsMap;
        exploreUrl: string | null;
    }) {
        const fieldIds = rows[0] ? Object.keys(rows[0]) : Object.keys(fields);
        const csvHeaders = fieldIds.map((fieldId) => {
            const item = fields[fieldId];
            if (!item) return fieldId;
            return getItemLabelWithoutTableName(item);
        });
        const csvRows = rows.map((row) =>
            CsvService.convertRowToCsv(row, fields, true, fieldIds),
        );
        const csv = stringify(csvRows, {
            header: true,
            columns: csvHeaders,
        });

        return {
            content: [
                {
                    type: 'text' as const,
                    text: rows.length === 0 ? 'Query returned 0 rows.' : csv,
                },
            ],
            structuredContent: {
                result: {
                    status: 'done' as const,
                    queryUuid,
                    rows,
                    fields,
                    exploreUrl,
                },
            },
        };
    }

    private async buildSqlQueryResultResponse({
        ctx,
        queryUuid,
        projectUuid,
        pageSize,
        includeStatus,
        sqlRunnerUrl,
    }: {
        ctx: McpProtocolContext;
        queryUuid: string;
        projectUuid: string;
        pageSize?: number;
        includeStatus: boolean;
        sqlRunnerUrl: string | null;
    }) {
        const { account } = McpService.getAccount(ctx);
        const result = await this.asyncQueryService.getAsyncQueryResults({
            account,
            projectUuid,
            queryUuid,
            page: 1,
            pageSize,
        });

        if (result.status !== QueryHistoryStatus.READY) {
            throw new UnexpectedServerError(
                `SQL query is not ready: ${result.status}`,
            );
        }

        const rows = result.rows.map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([key, cell]) => [key, cell.value.raw]),
            ),
        );
        const columns = Object.values(result.columns).map(
            (column) => column.reference,
        );

        if (rows.length === 0) {
            const header =
                columns.length > 0 ? `Columns: ${columns.join(', ')}` : '';
            return this.buildScopedResponse(
                ctx,
                `Query returned 0 rows.${header ? ` ${header}` : ''}`,
                {
                    result: {
                        ...(includeStatus ? { queryUuid } : {}),
                        status: 'done' as const,
                        rows: [],
                        columns,
                        rowCount: 0,
                        sqlRunnerUrl,
                    },
                },
                projectUuid,
            );
        }

        const csv = stringify(rows, {
            header: true,
            columns,
        });

        return this.buildScopedResponse(
            ctx,
            csv,
            {
                result: {
                    ...(includeStatus ? { queryUuid } : {}),
                    status: 'done' as const,
                    rows,
                    columns,
                    rowCount: rows.length,
                    sqlRunnerUrl,
                },
            },
            projectUuid,
        );
    }

    /**
     * Registers the run_ai_writeback tool on the current server. Kept separate
     * so setupHandlers can register it conditionally (dark launch — see the
     * AiWriteback gate in setupHandlers).
     */
    private registerRunAiWritebackTool(): void {
        this.mcpServer.registerTool(
            mcpRunAiWritebackTool.name,
            {
                title: mcpRunAiWritebackTool.title,
                description: mcpRunAiWritebackTool.description,
                inputSchema: mcpRunAiWritebackTool.inputSchema.shape,
                outputSchema: mcpRunAiWritebackTool.outputSchema.shape,
                annotations: mcpRunAiWritebackTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(
                    ctx,
                    McpToolName.RUN_AI_WRITEBACK,
                    projectUuid,
                );

                try {
                    const result = await this.aiWritebackService.run({
                        user,
                        projectUuid,
                        prompt: args.prompt,
                        source: 'mcp',
                    });

                    const summary = result.prUrl
                        ? `AI writeback complete. Pull request opened: ${result.prUrl}`
                        : 'AI writeback complete. The agent made no file changes, so no pull request was opened.';

                    return await this.buildScopedResponse(
                        ctx,
                        `${summary}\n\n${result.output}`,
                        {
                            output: result.output,
                            exitCode: result.exitCode,
                            prUrl: result.prUrl,
                        },
                        projectUuid,
                    );
                } catch (e) {
                    const errorMessage =
                        e instanceof Error ? e.message : String(e);
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error running AI writeback: ${errorMessage}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );
    }

    private registerContentWriteTools(): void {
        this.mcpServer.registerTool(
            mcpCreateContentTool.name,
            {
                title: mcpCreateContentTool.title,
                description: mcpCreateContentTool.description,
                inputSchema: mcpCreateContentTool.inputSchema.shape,
                annotations: mcpCreateContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    ctx,
                    McpToolName.CREATE_CONTENT,
                    projectUuid,
                );

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const createContentTool = getCreateContent({
                    createContent: toolsRuntime.createContent,
                });
                const result = await createContentTool.execute!(
                    argsWithProject,
                    {
                        toolCallId: '',
                        messages: [],
                    },
                );

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpEditContentTool.name,
            {
                title: mcpEditContentTool.title,
                description: mcpEditContentTool.description,
                inputSchema: mcpEditContentTool.inputSchema.shape,
                annotations: mcpEditContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.EDIT_CONTENT, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const editContentTool = getEditContent({
                    editContent: toolsRuntime.editContent,
                });
                const result = await editContentTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );
    }

    setupHandlers(
        options: {
            projectPinned: boolean;
            aiWritebackEnabled: boolean;
            mcpContentWritesEnabled: boolean;
        } = {
            projectPinned: false,
            aiWritebackEnabled: false,
            mcpContentWritesEnabled: true,
        },
    ): void {
        this.mcpServer.registerTool(
            mcpGetLightdashVersionTool.name,
            {
                title: mcpGetLightdashVersionTool.title,
                description: mcpGetLightdashVersionTool.description,
                inputSchema: mcpGetLightdashVersionTool.inputSchema.shape,
                annotations: mcpGetLightdashVersionTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                this.trackToolCall(ctx, McpToolName.GET_LIGHTDASH_VERSION);
                return {
                    content: [
                        {
                            type: 'text',
                            text: this.getLightdashVersion(ctx),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpListExploresTool.name,
            {
                title: mcpListExploresTool.title,
                description: mcpListExploresTool.description,
                inputSchema: mcpListExploresTool.inputSchema.shape,
                annotations: mcpListExploresTool.annotations,
            },
            async (_args, extra) => {
                try {
                    const ctx = getMcpContext(extra);

                    const projectUuid = await this.resolveProjectUuid(ctx);

                    this.trackToolCall(
                        ctx,
                        McpToolName.LIST_EXPLORES,
                        projectUuid,
                    );

                    const toolsRuntime = await this.getToolsRuntime(
                        ctx,
                        projectUuid,
                    );

                    const listExploresTool = getMcpListExplores({
                        listExplores: toolsRuntime.listExplores,
                    });

                    const result = await listExploresTool.execute!(
                        {},
                        {
                            toolCallId: '',
                            messages: [],
                        },
                    );

                    return await this.buildScopedResponse(
                        ctx,
                        await McpService.streamToolResult(result),
                        undefined,
                        projectUuid,
                    );
                } catch (error) {
                    this.logger.error(
                        '[McpService] Error in LIST_EXPLORES tool',
                        error,
                    );
                    throw error;
                }
            },
        );

        this.mcpServer.registerTool(
            mcpFindExploresTool.name,
            {
                title: mcpFindExploresTool.title,
                description: mcpFindExploresTool.description,
                inputSchema: mcpFindExploresTool.inputSchema.shape,
                annotations: mcpFindExploresTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user } = McpService.getAccount(ctx);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_EXPLORES, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );
                const availableExplores = await toolsRuntime.listExplores();

                const findExploresTool = getFindExplores({
                    findExplores: toolsRuntime.findExplores,
                    updateProgress: async () => {}, // No-op for MCP context
                    fieldSearchSize: 50,
                });
                const result = await findExploresTool.execute!(
                    {
                        ...argsWithProject,
                        searchQuery: args.searchQuery,
                    },
                    {
                        toolCallId: '',
                        messages: [],
                        experimental_context: { availableExplores },
                    },
                );
                const resultText = await McpService.streamToolResult(result);
                const metadata = await this.getActiveContextMetadata(ctx);

                const verifiedAnswerContext = metadata.agentUuid
                    ? await this.aiAgentService.getRelevantVerifiedAnswerContextForAgent(
                          user,
                          {
                              projectUuid,
                              agentUuid: metadata.agentUuid,
                              searchQuery: args.searchQuery,
                          },
                      )
                    : { relevantVerifiedAnswers: [] };

                const verifiedAnswersText =
                    verifiedAnswerContext.relevantVerifiedAnswers.length > 0
                        ? `\n\n<verifiedAnswers count="${verifiedAnswerContext.relevantVerifiedAnswers.length}">\n${JSON.stringify(
                              verifiedAnswerContext.relevantVerifiedAnswers,
                              null,
                              2,
                          )}\n</verifiedAnswers>`
                        : '';

                return this.buildScopedResponse(
                    ctx,
                    `${resultText}${verifiedAnswersText}`,
                    verifiedAnswerContext,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpFindFieldsTool.name,
            {
                title: mcpFindFieldsTool.title,
                description: mcpFindFieldsTool.description,
                inputSchema: mcpFindFieldsTool.inputSchema.shape,
                annotations: mcpFindFieldsTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_FIELDS, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const findFieldsTool = getFindFields({
                    getExplore: toolsRuntime.getExplore,
                    findFields: toolsRuntime.findFields,
                    updateProgress: async () => {}, // No-op for MCP context
                    pageSize: 15,
                });
                const result = await findFieldsTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpGetFieldsTool.name,
            {
                title: mcpGetFieldsTool.title,
                description: mcpGetFieldsTool.description,
                inputSchema: mcpGetFieldsTool.inputSchema.shape,
                annotations: mcpGetFieldsTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.GET_FIELDS, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const getFieldsTool = getGetFields({
                    getExplore: toolsRuntime.getExplore,
                });
                const result = await getFieldsTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpFindContentTool.name,
            {
                title: mcpFindContentTool.title,
                description: mcpFindContentTool.description,
                inputSchema: mcpFindContentTool.inputSchema.shape,
                annotations: mcpFindContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_CONTENT, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const findContentTool = getFindContent({
                    findContent: toolsRuntime.findContent,
                    siteUrl: this.lightdashConfig.siteUrl,
                    trackCoverage: () => {},
                });
                const result = await findContentTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpListContentTool.name,
            {
                title: mcpListContentTool.title,
                description: mcpListContentTool.description,
                inputSchema: mcpListContentTool.inputSchema.shape,
                annotations: mcpListContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.LIST_CONTENT, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const listContentTool = getListContent({
                    listContent: toolsRuntime.listContent,
                });
                const result = await listContentTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpReadContentTool.name,
            {
                title: mcpReadContentTool.title,
                description: mcpReadContentTool.description,
                inputSchema: mcpReadContentTool.inputSchema.shape,
                annotations: mcpReadContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.READ_CONTENT, projectUuid);

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const readContentTool = getReadContent({
                    readContent: toolsRuntime.readContent,
                });
                const result = await readContentTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        // Content writes (create/edit) are gated by an org-level setting so
        // admins can prevent MCP clients from modifying managed content.
        if (options.mcpContentWritesEnabled) {
            this.registerContentWriteTools();
        }

        // When the project is pinned via header, hide the project-selection
        // tools so clients can't change context for a request-scoped pin.
        if (!options.projectPinned) {
            this.mcpServer.registerTool(
                mcpListProjectsTool.name,
                {
                    title: mcpListProjectsTool.title,
                    description: mcpListProjectsTool.description,
                    inputSchema: mcpListProjectsTool.inputSchema.shape,
                    annotations: mcpListProjectsTool.annotations,
                },
                async (
                    _args,
                    extra: RequestHandlerExtra<
                        ServerRequest,
                        ServerNotification
                    >,
                ) => {
                    const ctx = getMcpContext(extra);
                    const { user, organizationUuid } =
                        McpService.getAccount(ctx);

                    this.trackToolCall(ctx, McpToolName.LIST_PROJECTS);

                    const allProjects = await wrapSentryTransaction(
                        'McpService.listProjects.getAllByOrganizationUuid',
                        { organizationUuid },
                        async () =>
                            this.projectModel.getAllByOrganizationUuid(
                                organizationUuid,
                            ),
                    );

                    const auditedAbility = this.createAuditedAbility(user);
                    const projectList = allProjects
                        .filter((project) =>
                            auditedAbility.can(
                                'view',
                                subject('Project', {
                                    organizationUuid,
                                    projectUuid: project.projectUuid,
                                }),
                            ),
                        )
                        .map((project) => ({
                            name: project.name,
                            projectUuid: project.projectUuid,
                        }));

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(projectList, null, 2),
                            },
                        ],
                    };
                },
            );

            this.mcpServer.registerTool(
                mcpSetProjectTool.name,
                {
                    title: mcpSetProjectTool.title,
                    description: mcpSetProjectTool.description,
                    inputSchema: mcpSetProjectTool.inputSchema.shape,
                    annotations: mcpSetProjectTool.annotations,
                },
                async (
                    args,
                    extra: RequestHandlerExtra<
                        ServerRequest,
                        ServerNotification
                    >,
                ) => {
                    const ctx = getMcpContext(extra);
                    const { user, organizationUuid, account } =
                        McpService.getAccount(ctx);

                    this.trackToolCall(
                        ctx,
                        McpToolName.SET_PROJECT,
                        args.projectUuid,
                    );

                    if (!args.projectUuid) {
                        throw new ParameterError('Project UUID is required');
                    }

                    // Validate project access
                    const project = await this.projectService.getProject(
                        args.projectUuid,
                        account,
                    );

                    const auditedAbility = this.createAuditedAbility(user);
                    if (
                        auditedAbility.cannot(
                            'view',
                            subject('Project', {
                                projectUuid: args.projectUuid,
                                organizationUuid: project.organizationUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError(
                            'You do not have access to this project',
                        );
                    }

                    // Determine tags: use provided tags, or preserve existing, or set to null
                    let tagsToSet: string[] | null = null;
                    if (args.tags !== undefined) {
                        tagsToSet = args.tags.length > 0 ? args.tags : null;
                    }

                    // Agent is cleared because agents are scoped to a project
                    await this.mcpContextModel.setContext({
                        userUuid: user.userUuid,
                        organizationUuid,
                        context: {
                            projectUuid: args.projectUuid,
                            projectName: project.name,
                            tags: tagsToSet,
                            agentUuid: null,
                            agentName: null,
                        },
                    });

                    const result = {
                        projectUuid: args.projectUuid,
                        projectName: project.name,
                        selectedTags: tagsToSet,
                    };

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                },
            );
        }

        this.mcpServer.registerTool(
            mcpGetCurrentProjectTool.name,
            {
                title: mcpGetCurrentProjectTool.title,
                description: mcpGetCurrentProjectTool.description,
                inputSchema: mcpGetCurrentProjectTool.inputSchema.shape,
                annotations: mcpGetCurrentProjectTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                this.trackToolCall(ctx, McpToolName.GET_CURRENT_PROJECT);

                const contextRow = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );

                if (!contextRow || !contextRow.context.projectUuid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        error: 'No active project set. Use set_project to set one.',
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                }

                const { projectUuid, projectName, tags } = contextRow.context;

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    projectUuid,
                                    projectName,
                                    selectedTags: tags,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpListAgentsTool.name,
            {
                title: mcpListAgentsTool.title,
                description: mcpListAgentsTool.description,
                inputSchema: mcpListAgentsTool.inputSchema.shape,
                annotations: mcpListAgentsTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, McpToolName.LIST_AGENTS);

                const projectUuid =
                    args.projectUuid ??
                    (await this.getProjectUuidFromContext(ctx));

                const agents = await this.aiAgentService.listAgents(
                    user,
                    projectUuid,
                );

                const agentList = agents.map((agent) => ({
                    uuid: agent.uuid,
                    name: agent.name,
                    description: agent.description,
                    tags: agent.tags,
                    projectUuid: agent.projectUuid,
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(agentList, null, 2),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpRouteAgentTool.name,
            {
                title: mcpRouteAgentTool.title,
                description: mcpRouteAgentTool.description,
                inputSchema: mcpRouteAgentTool.inputSchema.shape,
                annotations: mcpRouteAgentTool.annotations,
                outputSchema: mcpRouteAgentTool.outputSchema.shape,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user, organizationUuid, account } =
                    McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                const projectUuid =
                    args.projectUuid ?? (await this.resolveProjectUuid(ctx));

                this.trackToolCall(ctx, McpToolName.ROUTE_AGENT, projectUuid);

                let selection;
                try {
                    selection = await this.aiRouterService.routePromptToAgent(
                        account,
                        {
                            prompt: args.prompt,
                            projectUuid,
                            mode: 'mcp',
                        },
                    );
                } catch (error) {
                    if (error instanceof NotFoundError) {
                        throw new ParameterError(
                            'AI router is not enabled for this organization. Use set_agent to choose an agent manually or ask an admin to enable the AI router.',
                        );
                    }
                    throw error;
                }

                const project = await this.projectService.getProject(
                    projectUuid,
                    account,
                );

                await this.setActiveAgentContext(user, organizationUuid, {
                    projectUuid: selection.suggestedAgent.projectUuid,
                    projectName: project.name,
                    agentUuid: selection.suggestedAgent.uuid,
                    agentName: selection.suggestedAgent.name,
                });

                const structuredContent = {
                    ...McpService.buildAgentContextResponse(
                        selection.suggestedAgent,
                    ),
                    confidence: selection.confidence,
                    reasoning: selection.reasoning,
                    candidates: selection.candidates.map((candidate) => ({
                        agentUuid: candidate.uuid,
                        name: candidate.name,
                        description: candidate.description ?? null,
                    })),
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(structuredContent, null, 2),
                        },
                    ],
                    structuredContent,
                };
            },
        );

        this.mcpServer.registerTool(
            mcpSetAgentTool.name,
            {
                title: mcpSetAgentTool.title,
                description: mcpSetAgentTool.description,
                inputSchema: mcpSetAgentTool.inputSchema.shape,
                annotations: mcpSetAgentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid, account } =
                    McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, McpToolName.SET_AGENT, args.agentUuid);

                if (!args.agentUuid) {
                    throw new ParameterError('Agent UUID is required');
                }

                const projectUuid = await this.resolveProjectUuid(ctx);
                const project = await this.projectService.getProject(
                    projectUuid,
                    account,
                );

                // Validates copilot enabled, agent exists, user has access, and returns summary context
                const agent = await this.aiAgentService.getAgent(
                    user,
                    args.agentUuid,
                    projectUuid,
                    { includeSummaryContext: true },
                );

                await this.setActiveAgentContext(user, organizationUuid, {
                    projectUuid: agent.projectUuid,
                    projectName: project.name,
                    agentUuid: agent.uuid,
                    agentName: agent.name,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                McpService.buildAgentContextResponse(agent),
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpClearAgentTool.name,
            {
                title: mcpClearAgentTool.title,
                description: mcpClearAgentTool.description,
                inputSchema: mcpClearAgentTool.inputSchema.shape,
                annotations: mcpClearAgentTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                this.trackToolCall(ctx, McpToolName.CLEAR_AGENT);

                const existingContext = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );

                await this.mcpContextModel.setContext({
                    userUuid: user.userUuid,
                    organizationUuid,
                    context: {
                        projectUuid: existingContext?.context.projectUuid ?? '',
                        projectName: existingContext?.context.projectName ?? '',
                        tags: existingContext?.context.tags || null,
                        agentUuid: null,
                        agentName: null,
                    },
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    message:
                                        'Agent context cleared successfully.',
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpGetCurrentAgentTool.name,
            {
                title: mcpGetCurrentAgentTool.title,
                description: mcpGetCurrentAgentTool.description,
                inputSchema: mcpGetCurrentAgentTool.inputSchema.shape,
                annotations: mcpGetCurrentAgentTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, McpToolName.GET_CURRENT_AGENT);

                const contextRow = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );

                if (!contextRow?.context.agentUuid) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        error: 'No active agent set. Use set_agent to set one.',
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    };
                }

                const agent = await this.aiAgentService.getAgent(
                    user,
                    contextRow.context.agentUuid,
                    undefined,
                    { includeSummaryContext: true },
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                McpService.buildAgentContextResponse(agent),
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        // Register chart app resource for the MCP App UI
        const chartResourceUri = 'ui://render-chart/chart.html';
        registerAppResource(
            this.mcpServer,
            chartResourceUri,
            chartResourceUri,
            { mimeType: RESOURCE_MIME_TYPE },
            async () => {
                const htmlPath = path.join(
                    __dirname,
                    'mcp-chart-app',
                    'dist',
                    'chart-app.html',
                );
                const html = await fs.readFile(htmlPath, 'utf-8');
                return {
                    contents: [
                        {
                            uri: chartResourceUri,
                            mimeType: RESOURCE_MIME_TYPE,
                            text: html,
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            mcpRunMetricQueryTool.name,
            {
                title: mcpRunMetricQueryTool.title,
                description: mcpRunMetricQueryTool.description,
                inputSchema: mcpRunMetricQueryTool.inputSchema.shape,
                outputSchema: mcpRunMetricQueryTool.outputSchema,
                annotations: mcpRunMetricQueryTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ..._args, projectUuid };

                this.trackToolCall(
                    ctx,
                    McpToolName.RUN_METRIC_QUERY,
                    projectUuid,
                );

                try {
                    const deadlineMs =
                        Date.now() + McpService.getMcpQueryWaitMs(extra);
                    const { account } = McpService.getAccount(ctx);
                    const queryTool =
                        toolRunQueryArgsSchemaTransformed.parse(
                            argsWithProject,
                        );
                    const { query, userAttributeOverrides } =
                        await this.buildMcpMetricQuery({
                            ctx,
                            projectUuid,
                            queryTool,
                        });

                    const { queryUuid } =
                        await this.asyncQueryService.executeAsyncMetricQuery({
                            account,
                            projectUuid,
                            metricQuery: query,
                            context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                            userAttributeOverrides,
                        });

                    const queryHistory =
                        await this.asyncQueryService.pollQueryHistoryUntilDeadline(
                            {
                                account,
                                projectUuid,
                                queryUuid,
                                deadlineMs,
                                pollIntervalMs: MCP_QUERY_POLL_INTERVAL_MS,
                                signal: extra.signal,
                            },
                        );

                    if (McpService.isQueryRunningStatus(queryHistory.status)) {
                        return McpService.getRunningQueryResponse(queryUuid);
                    }

                    if (queryHistory.status !== QueryHistoryStatus.READY) {
                        throw new UnexpectedServerError(
                            queryHistory.error ??
                                `Metric query finished with status ${queryHistory.status}`,
                        );
                    }

                    const results =
                        await this.asyncQueryService.getRawAsyncQueryResults({
                            account,
                            projectUuid,
                            queryUuid,
                        });
                    const exploreUrl = await this.buildMetricExploreUrl({
                        ctx,
                        projectUuid,
                        metricQuery: query,
                        fieldsMap: results.fields,
                        columnOrder: results.rows[0]
                            ? Object.keys(results.rows[0])
                            : Object.keys(results.fields),
                        queryTool,
                    });

                    return McpService.buildMetricQueryPollResult({
                        queryUuid,
                        rows: results.rows,
                        fields: results.fields,
                        exploreUrl,
                    });
                } catch (e) {
                    const errorMessage =
                        e instanceof Error ? e.message : String(e);
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error running metric query: ${errorMessage}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );

        registerAppTool(
            this.mcpServer,
            mcpRenderChartTool.name,
            {
                title: mcpRenderChartTool.title,
                description: mcpRenderChartTool.description,
                inputSchema: mcpRenderChartTool.inputSchema.shape,
                outputSchema: mcpRenderChartTool.outputSchema,
                annotations: mcpRenderChartTool.annotations,
                _meta: { ui: { resourceUri: chartResourceUri } },
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ..._args, projectUuid };

                this.trackToolCall(ctx, McpToolName.RENDER_CHART, projectUuid);

                try {
                    const { user, account } = McpService.getAccount(ctx);
                    const renderTool =
                        toolRenderChartArgsSchemaTransformed.parse(
                            argsWithProject,
                        );

                    const queryHistory =
                        await this.asyncQueryService.getAsyncQueryHistory({
                            account,
                            projectUuid,
                            queryUuid: renderTool.queryUuid,
                        });

                    if (
                        queryHistory.context !==
                        QueryExecutionContext.MCP_RUN_METRIC_QUERY
                    ) {
                        throw new ParameterError(
                            'render_chart currently supports queries started by run_metric_query',
                        );
                    }

                    if (queryHistory.status !== QueryHistoryStatus.READY) {
                        throw new UnexpectedServerError(
                            queryHistory.error ??
                                `Query is not ready to render; current status is ${queryHistory.status}`,
                        );
                    }

                    await this.assertMetricQueryInEffectiveScope({
                        ctx,
                        user,
                        projectUuid,
                        metricQuery: queryHistory.metricQuery,
                    });

                    const queryTool = McpService.buildRenderChartQueryTool({
                        renderTool,
                        metricQuery: queryHistory.metricQuery,
                    });

                    const results =
                        await this.asyncQueryService.getRawAsyncQueryResults({
                            account,
                            projectUuid,
                            queryUuid: renderTool.queryUuid,
                        });

                    return await this.buildRenderChartResponse({
                        ctx,
                        queryUuid: renderTool.queryUuid,
                        projectUuid,
                        queryTool,
                        query: queryHistory.metricQuery,
                        rows: results.rows,
                        fields: results.fields,
                    });
                } catch (e) {
                    const errorMessage =
                        e instanceof Error ? e.message : String(e);
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error rendering chart: ${errorMessage}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );

        this.mcpServer.registerTool(
            mcpSearchFieldValuesTool.name,
            {
                title: mcpSearchFieldValuesTool.title,
                description: mcpSearchFieldValuesTool.description,
                inputSchema: mcpSearchFieldValuesTool.inputSchema.shape,
                annotations: mcpSearchFieldValuesTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    ctx,
                    McpToolName.SEARCH_FIELD_VALUES,
                    projectUuid,
                );

                const toolsRuntime = await this.getToolsRuntime(
                    ctx,
                    projectUuid,
                );

                const searchFieldValuesTool = getSearchFieldValues({
                    searchFieldValues: toolsRuntime.searchFieldValues,
                });
                const result = await searchFieldValuesTool.execute!(
                    argsWithProject,
                    {
                        toolCallId: '',
                        messages: [],
                    },
                );

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                    undefined,
                    projectUuid,
                );
            },
        );

        // TODO: move config-dependent tool contracts into defineTool so
        // description and inputSchema can be resolved from one runtime-aware
        // definition instead of being rebuilt here.
        const runSqlArgsSchema = createToolRunSqlArgsSchema({
            maxLimit: this.lightdashConfig.mcp.runSqlMaxLimit,
        });
        this.mcpServer.registerTool(
            mcpRunSqlTool.name,
            {
                title: mcpRunSqlTool.title,
                description: buildRunSqlDescription(
                    500,
                    this.lightdashConfig.mcp.runSqlMaxLimit,
                ),
                inputSchema: createMcpCompatibleInputShape(runSqlArgsSchema),
                outputSchema: mcpRunSqlTool.outputSchema,
                annotations: mcpRunSqlTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { account } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(ctx, McpToolName.RUN_SQL, projectUuid);

                try {
                    const deadlineMs =
                        Date.now() + McpService.getMcpQueryWaitMs(extra);
                    const { queryUuid } =
                        await this.asyncQueryService.executeAsyncSqlQuery({
                            account,
                            projectUuid,
                            sql: args.sql,
                            limit: args.limit ?? 500,
                            context: QueryExecutionContext.MCP_RUN_SQL,
                        });

                    const queryHistory =
                        await this.asyncQueryService.pollQueryHistoryUntilDeadline(
                            {
                                account,
                                projectUuid,
                                queryUuid,
                                deadlineMs,
                                pollIntervalMs: MCP_QUERY_POLL_INTERVAL_MS,
                                signal: extra.signal,
                            },
                        );

                    if (McpService.isQueryRunningStatus(queryHistory.status)) {
                        return McpService.getRunningQueryResponse(queryUuid);
                    }

                    if (queryHistory.status !== QueryHistoryStatus.READY) {
                        throw new UnexpectedServerError(
                            queryHistory.error ??
                                `SQL query finished with status ${queryHistory.status}`,
                        );
                    }

                    const sqlRunnerUrl = await this.buildSqlRunnerUrl({
                        ctx,
                        projectUuid,
                        sql: args.sql,
                        limit: args.limit ?? 500,
                    });

                    return await this.buildSqlQueryResultResponse({
                        ctx,
                        queryUuid,
                        projectUuid,
                        pageSize: args.limit ?? 500,
                        includeStatus: false,
                        sqlRunnerUrl,
                    });
                } catch (e) {
                    const errorMessage =
                        e instanceof Error ? e.message : String(e);
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error running SQL query: ${errorMessage}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );

        this.mcpServer.registerTool(
            mcpGetQueryResultTool.name,
            {
                title: mcpGetQueryResultTool.title,
                description: mcpGetQueryResultTool.description,
                inputSchema: mcpGetQueryResultTool.inputSchema.shape,
                outputSchema: mcpGetQueryResultTool.outputSchema,
                annotations: mcpGetQueryResultTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, account } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(
                    ctx,
                    McpToolName.GET_QUERY_RESULT,
                    projectUuid,
                );

                try {
                    let queryHistory =
                        await this.asyncQueryService.getAsyncQueryHistory({
                            account,
                            projectUuid,
                            queryUuid: args.queryUuid,
                        });
                    const isMcpSqlQuery =
                        queryHistory.context ===
                        QueryExecutionContext.MCP_RUN_SQL;
                    const isMcpMetricQuery =
                        queryHistory.context ===
                        QueryExecutionContext.MCP_RUN_METRIC_QUERY;

                    if (!isMcpSqlQuery && !isMcpMetricQuery) {
                        throw new ParameterError(
                            'Query was not started by an MCP query tool',
                        );
                    }

                    if (McpService.isQueryRunningStatus(queryHistory.status)) {
                        queryHistory =
                            await this.asyncQueryService.pollQueryHistoryUntilDeadline(
                                {
                                    account,
                                    projectUuid,
                                    queryUuid: args.queryUuid,
                                    deadlineMs:
                                        Date.now() +
                                        McpService.getMcpQueryWaitMs(extra),
                                    pollIntervalMs: MCP_QUERY_POLL_INTERVAL_MS,
                                    signal: extra.signal,
                                },
                            );

                        if (
                            McpService.isQueryRunningStatus(queryHistory.status)
                        ) {
                            return McpService.getRunningQueryResponse(
                                args.queryUuid,
                            );
                        }
                    }

                    if (
                        queryHistory.status === QueryHistoryStatus.ERROR ||
                        queryHistory.status === QueryHistoryStatus.CANCELLED ||
                        queryHistory.status === QueryHistoryStatus.EXPIRED
                    ) {
                        return await this.buildScopedResponse(
                            ctx,
                            queryHistory.error ??
                                `Query ${queryHistory.status}`,
                            {
                                result: {
                                    status: McpService.getPollingStatus(
                                        queryHistory.status,
                                    ),
                                    queryUuid: args.queryUuid,
                                    error: queryHistory.error ?? null,
                                },
                            },
                            projectUuid,
                        );
                    }

                    if (isMcpSqlQuery) {
                        const { requestParameters } = queryHistory;
                        const sqlRunnerUrl =
                            requestParameters && 'sql' in requestParameters
                                ? await this.buildSqlRunnerUrl({
                                      ctx,
                                      projectUuid,
                                      sql: requestParameters.sql,
                                      limit: requestParameters.limit,
                                  })
                                : null;

                        return await this.buildSqlQueryResultResponse({
                            ctx,
                            queryUuid: args.queryUuid,
                            projectUuid,
                            includeStatus: true,
                            sqlRunnerUrl,
                        });
                    }

                    if (isMcpMetricQuery) {
                        await this.assertMetricQueryInEffectiveScope({
                            ctx,
                            user,
                            projectUuid,
                            metricQuery: queryHistory.metricQuery,
                        });

                        const results =
                            await this.asyncQueryService.getRawAsyncQueryResults(
                                {
                                    account,
                                    projectUuid,
                                    queryUuid: args.queryUuid,
                                },
                            );
                        const exploreUrl = await this.buildMetricExploreUrl({
                            ctx,
                            projectUuid,
                            metricQuery: queryHistory.metricQuery,
                            fieldsMap: results.fields,
                            columnOrder: results.rows[0]
                                ? Object.keys(results.rows[0])
                                : Object.keys(results.fields),
                        });

                        return McpService.buildMetricQueryPollResult({
                            queryUuid: args.queryUuid,
                            rows: results.rows,
                            fields: results.fields,
                            exploreUrl,
                        });
                    }

                    throw new ParameterError(
                        'Query was not started by an MCP query tool',
                    );
                } catch (e) {
                    const errorMessage =
                        e instanceof Error ? e.message : String(e);
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error getting query result: ${errorMessage}`,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );

        this.mcpServer.registerTool(
            mcpListVerifiedContentTool.name,
            {
                title: mcpListVerifiedContentTool.title,
                description: mcpListVerifiedContentTool.description,
                inputSchema: mcpListVerifiedContentTool.inputSchema.shape,
                annotations: mcpListVerifiedContentTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(
                    ctx,
                    McpToolName.LIST_VERIFIED_CONTENT,
                    projectUuid,
                );

                const effectiveScope = await this.getEffectiveScopeFromContext(
                    ctx,
                    projectUuid,
                );
                const verifiedContent =
                    await this.contentVerificationService.listVerifiedContent(
                        user,
                        projectUuid,
                    );
                const scopedVerifiedContent = verifiedContent.filter(
                    ({ spaceUuid }) =>
                        McpService.hasAgentSpaceAccess(
                            effectiveScope.spaceAccess,
                            spaceUuid,
                        ),
                );

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(scopedVerifiedContent, null, 2),
                    undefined,
                    projectUuid,
                );
            },
        );

        this.registerSkillToolHandlers();

        // Dark-launched: this tool is only registered — and therefore only
        // advertised in tools/list and invocable — when the AiWriteback
        // feature flag is enabled for the caller. Clients without the flag
        // never see it. The flag is resolved per-request in the MCP router
        // (mcpRouter.ts) and passed through createServer.
        if (options.aiWritebackEnabled) {
            this.registerRunAiWritebackTool();
        }

        this.mcpServer.registerPrompt(
            'lightdash-analyst',
            {
                title: 'Lightdash Data Analyst',
                description:
                    'Guidelines for querying Lightdash data using MCP tools. After setting project context, call route_agent at the start of each new user request to activate the best agent automatically. Includes explore selection, query building, visualization rules, and active agent context (instructions, verified questions, available explores). Inject this into your system prompt for best results.',
                argsSchema: {},
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const metadata = await this.getActiveContextMetadata(ctx);
                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.getProjectUuidFromContext(ctx);

                let promptText: string;

                if (metadata.agentUuid) {
                    try {
                        const agent = await this.aiAgentService.getAgent(
                            user,
                            metadata.agentUuid,
                            projectUuid,
                            { includeSummaryContext: true },
                        );
                        promptText = getMcpAnalystPromptWithContext({
                            agentName: agent.name,
                            instruction: agent.context.instruction,
                            explores: agent.context.explores,
                            verifiedQuestions: agent.context.verifiedQuestions,
                        });
                    } catch {
                        promptText = MCP_ANALYST_PROMPT;
                    }
                } else {
                    promptText = MCP_ANALYST_PROMPT;
                }

                return {
                    messages: [
                        {
                            role: 'user' as const,
                            content: {
                                type: 'text' as const,
                                text: promptText,
                            },
                        },
                    ],
                };
            },
        );
    }

    async getProjectUuidFromContext(context: McpProtocolContext) {
        const user = context.authInfo?.extra.user;
        const headerProjectUuid = context.authInfo?.extra.headerProjectUuid;

        if (!user || !user.organizationUuid) {
            return undefined;
        }

        if (headerProjectUuid) {
            return headerProjectUuid;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        return contextRow?.context.projectUuid;
    }

    private async getEffectiveScopeFromContext(
        context: McpProtocolContext,
        projectUuid?: string,
    ): Promise<McpEffectiveScope> {
        const user = context.authInfo?.extra.user;

        if (!user || !user.organizationUuid) {
            return {
                tags: null,
                spaceAccess: null,
                agentUuid: null,
                agentName: null,
            };
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        if (!contextRow) {
            return {
                tags: null,
                spaceAccess: null,
                agentUuid: null,
                agentName: null,
            };
        }

        if (projectUuid && contextRow.context.projectUuid !== projectUuid) {
            return {
                tags: null,
                spaceAccess: null,
                agentUuid: null,
                agentName: null,
            };
        }

        if (!contextRow.context.agentUuid) {
            return {
                tags: contextRow.context.tags || null,
                spaceAccess: null,
                agentUuid: null,
                agentName: null,
            };
        }

        const agent = await this.aiAgentService.getAgent(
            user,
            contextRow.context.agentUuid,
            projectUuid,
        );

        return {
            tags: agent.tags,
            spaceAccess: agent.spaceAccess,
            agentUuid: agent.uuid,
            agentName: agent.name,
        };
    }

    private async getEffectiveTagsFromContext(
        context: McpProtocolContext,
        projectUuid?: string,
    ) {
        const scope = await this.getEffectiveScopeFromContext(
            context,
            projectUuid,
        );
        return scope.tags;
    }

    private static hasAgentSpaceAccess(
        agentSpaceAccess: string[] | null | undefined,
        spaceUuid: string,
    ): boolean {
        return (
            !agentSpaceAccess ||
            agentSpaceAccess.length === 0 ||
            agentSpaceAccess.includes(spaceUuid)
        );
    }

    async getAgentUuidFromContext(context: McpProtocolContext) {
        const user = context.authInfo?.extra.user;

        if (!user || !user.organizationUuid) {
            return null;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        return contextRow?.context.agentUuid ?? null;
    }

    async getActiveContextMetadata(context: McpProtocolContext) {
        const user = context.authInfo?.extra.user;

        if (!user || !user.organizationUuid) {
            return {
                projectUuid: null,
                projectName: null,
                agentUuid: null,
                agentName: null,
                tags: null,
            };
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        if (!contextRow) {
            return {
                projectUuid: null,
                projectName: null,
                agentUuid: null,
                agentName: null,
                tags: null,
            };
        }

        const { projectUuid, projectName, agentUuid, agentName, tags } =
            contextRow.context;

        return {
            projectUuid,
            projectName,
            agentUuid,
            agentName,
            tags,
        };
    }

    async getMergedUserAttributes(
        context: McpProtocolContext,
    ): Promise<UserAttributeValueMap> {
        const user = context.authInfo?.extra.user;
        const headerUserAttributes =
            context.authInfo?.extra.headerUserAttributes;

        if (!user || !user.organizationUuid) {
            return {};
        }

        // Get database defaults
        const dbAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            });

        // Validate header attributes if present (admin + narrowing check)
        if (headerUserAttributes) {
            const auditedAbility = this.createAuditedAbility(user);
            validateUserAttributeOverrides(
                user,
                auditedAbility,
                headerUserAttributes,
                dbAttributes,
            );
        }

        return mergeUserAttributes(dbAttributes, headerUserAttributes);
    }

    async getUserAttributeOverridesFromContext(
        context: McpProtocolContext,
    ): Promise<UserAttributeValueMap | undefined> {
        const user = context.authInfo?.extra.user;
        const headerUserAttributes =
            context.authInfo?.extra.headerUserAttributes;

        if (!user || !user.organizationUuid) {
            return undefined;
        }

        if (!headerUserAttributes) {
            return undefined;
        }

        // Validate header attributes (admin + narrowing check)
        const dbAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            });
        const auditedAbility = this.createAuditedAbility(user);
        validateUserAttributeOverrides(
            user,
            auditedAbility,
            headerUserAttributes,
            dbAttributes,
        );

        return headerUserAttributes;
    }

    async resolveProjectUuid(context: McpProtocolContext) {
        const headerProjectUuid = context.authInfo?.extra.headerProjectUuid;

        const projectUuid = await this.getProjectUuidFromContext(context);
        if (!projectUuid) {
            throw new ForbiddenError(
                'No project context set. Use set_project or provide projectUuid parameter.',
            );
        }
        // UUIDs from mcp_context were view-checked at set_project write time.
        // The X-Lightdash-Project header skips that path, so gate it here —
        // otherwise any tool that doesn't re-check (e.g. list_explores) would
        // leak project metadata cross-tenant.
        if (headerProjectUuid && headerProjectUuid === projectUuid) {
            const { user, account } = McpService.getAccount(context);

            const project = await this.projectService.getProject(
                projectUuid,
                account,
            );

            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'view',
                    subject('Project', {
                        projectUuid,
                        organizationUuid: project.organizationUuid,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    'You do not have access to this project',
                );
            }
        }
        return projectUuid;
    }

    public getServer(): McpServer {
        return this.mcpServer;
    }

    /**
     * Creates a new McpServer instance with all handlers registered.
     * Required for SDK 1.26.0+ stateful mode where each session needs its own server.
     * See: https://github.com/advisories/GHSA-345p-7cg4-v4c7
     */
    public async createServer(options?: {
        projectPinned?: boolean;
        aiWritebackEnabled?: boolean;
        mcpContentWritesEnabled?: boolean;
    }): Promise<McpServer> {
        const newServer = Sentry.wrapMcpServerWithSentry(
            new McpServer({
                name: 'Lightdash MCP Server',
                version: VERSION,
                websiteUrl: this.lightdashConfig.siteUrl,
                icons: [
                    {
                        src: `${this.lightdashConfig.siteUrl}/logo-icon.svg`,
                        mimeType: 'image/svg+xml',
                    },
                    {
                        src: `${this.lightdashConfig.siteUrl}/favicon-32x32.png`,
                        mimeType: 'image/png',
                        sizes: ['32x32'],
                    },
                    {
                        src: `${this.lightdashConfig.siteUrl}/apple-touch-icon.png`,
                        mimeType: 'image/png',
                        sizes: ['152x152'],
                    },
                ],
            }),
        );

        // Temporarily swap the server to register handlers on the new instance.
        // Kept synchronous so concurrent createServer calls can't observe each
        // other's swapped this.mcpServer across an await.
        const originalServer = this.mcpServer;
        this.mcpServer = newServer;
        this.setupHandlers({
            projectPinned: options?.projectPinned ?? false,
            aiWritebackEnabled: options?.aiWritebackEnabled ?? false,
            mcpContentWritesEnabled: options?.mcpContentWritesEnabled ?? true,
        });
        this.mcpServer = originalServer;

        // Skill resources load asynchronously; register them directly on the
        // new server so no server swap spans the await.
        await this.setupSkillResourceHandlers(newServer);

        return newServer;
    }

    private registerSkillToolHandlers(): void {
        this.mcpServer.registerTool(
            mcpListSkillsTool.name,
            {
                title: mcpListSkillsTool.title,
                description: mcpListSkillsTool.description,
                inputSchema: mcpListSkillsTool.inputSchema.shape,
                outputSchema: mcpListSkillsTool.outputSchema.shape,
                annotations: mcpListSkillsTool.annotations,
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);
                this.trackToolCall(ctx, McpToolName.LIST_SKILLS);

                const skills = await this.aiAgentToolsService.listMcpSkills();
                return mcpListSkillsTool.result.structured(
                    JSON.stringify({ skills }, null, 2),
                    { skills },
                );
            },
        );

        this.mcpServer.registerTool(
            mcpReadSkillTool.name,
            {
                title: mcpReadSkillTool.title,
                description: mcpReadSkillTool.description,
                inputSchema: mcpReadSkillTool.inputSchema.shape,
                outputSchema: mcpReadSkillTool.outputSchema.shape,
                annotations: mcpReadSkillTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                this.trackToolCall(ctx, McpToolName.READ_SKILL);

                const result = await this.aiAgentToolsService.loadMcpSkill(
                    args.name,
                );
                if (!result) {
                    throw new NotFoundError(
                        `Skill "${args.name}" was not found`,
                    );
                }
                const { skill, body } = result;

                return mcpReadSkillTool.result.structured(body, {
                    skill,
                    body,
                });
            },
        );

        this.mcpServer.registerTool(
            mcpReadSkillResourceTool.name,
            {
                title: mcpReadSkillResourceTool.title,
                description: mcpReadSkillResourceTool.description,
                inputSchema: mcpReadSkillResourceTool.inputSchema.shape,
                outputSchema: mcpReadSkillResourceTool.outputSchema.shape,
                annotations: mcpReadSkillResourceTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                this.trackToolCall(ctx, McpToolName.READ_SKILL_RESOURCE);

                const result =
                    await this.aiAgentToolsService.loadMcpSkillResource(args);
                if (!result) {
                    throw new NotFoundError(
                        `Skill resource "${args.path}" was not found for skill "${args.name}"`,
                    );
                }

                return mcpReadSkillResourceTool.result.structured(result.body, {
                    skill: result.skill,
                    resource: result.resource,
                    body: result.body,
                });
            },
        );
    }

    private async setupSkillResourceHandlers(
        mcpServer: McpServer,
    ): Promise<void> {
        // Built-in skills are optional context, not core MCP functionality.
        // This runs per request (createServer is per-request), so a skill load
        // or registration failure must never reject and 500 the whole endpoint
        // — log it and serve the server without skill resources.
        try {
            const resources =
                await this.aiAgentToolsService.listMcpSkillResources();

            resources.forEach((resource) => {
                mcpServer.registerResource(
                    resource.name,
                    resource.uri,
                    {
                        title: resource.title,
                        description: resource.description,
                        mimeType: resource.mimeType,
                        size: resource.size,
                    },
                    async () => {
                        const text =
                            await this.aiAgentToolsService.getMcpSkillResourceBody(
                                resource.uri,
                            );
                        if (text === undefined) {
                            throw new NotFoundError(
                                `Resource "${resource.uri}" was not found`,
                            );
                        }
                        return {
                            contents: [
                                {
                                    uri: resource.uri,
                                    mimeType: resource.mimeType,
                                    text,
                                },
                            ],
                        };
                    },
                );
            });

            // The SDK auto-advertises `resources.listChanged: true` when
            // registerResource is called, but we never emit list_changed
            // notifications. We also declare the skills extension so clients can
            // detect built-in skill support.
            mcpServer.server.registerCapabilities({
                resources: { subscribe: false, listChanged: false },
                // Advertise under both: `extensions` per the final SEP, and
                // `experimental` for draft-era clients (the de-facto wild form).
                experimental: {
                    [MCP_SKILLS_EXTENSION_NAME]: {},
                },
                extensions: {
                    [MCP_SKILLS_EXTENSION_NAME]: {},
                },
            });
        } catch (error) {
            this.logger.warn('Failed to register built-in skill resources', {
                error,
            });
        }
    }

    static getAccount(context: McpProtocolContext) {
        const user = context.authInfo?.extra.user;
        const account = context.authInfo?.extra.account;

        if (!user || !user.organizationUuid || !account) {
            throw new ForbiddenError(
                'MCP request is missing authenticated user context',
            );
        }
        return { user, account, organizationUuid: user.organizationUuid };
    }

    public canAccessMcp(context: McpProtocolContext): boolean {
        if (!context.authInfo) {
            throw new ForbiddenError('Invalid authInfo context');
        }

        const user = context.authInfo.extra?.user;
        const account = context.authInfo.extra?.account;

        // TODO replace with CASL ability check
        // Do not enforce client scopes for now until more MCP clients support this
        /*
        //const { scopes } = account.authentication;

        if (
            !scopes.includes(OAuthScope.MCP_READ) &&
            !scopes.includes(OAuthScope.MCP_WRITE)
        ) {
            throw new ForbiddenError('You are not allowed to access MCP');
        }
        */

        if (!this.lightdashConfig.mcp.enabled) {
            throw new MissingConfigError('MCP is not enabled');
        }

        return true;
    }

    // MCP is enabled if MCP_ENABLED is true, AI Copilot is enabled, or user is on trial
    public async isEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ) {
        if (this.lightdashConfig.mcp.enabled) {
            return true;
        }

        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });

        if (aiCopilotFlag.enabled) {
            return true;
        }

        if (!user.organizationUuid) {
            return false;
        }

        return this.aiOrganizationSettingsService.isEligibleForTrial(
            aiCopilotFlag.enabled,
            user.organizationUuid,
        );
    }

    /**
     * Whether the run_ai_writeback tool should be exposed to this caller.
     * Gated behind the AiWriteback feature flag (off by default) so the tool
     * can be dark launched — clients without the flag never see it in
     * tools/list. Resolved per-request and passed into createServer.
     */
    public async isAiWritebackEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.AiWriteback,
        });
        return flag.enabled;
    }

    public async isMcpContentWritesEnabled(
        user: Pick<SessionUser, 'organizationUuid'>,
    ): Promise<boolean> {
        return this.aiOrganizationSettingsService.isMcpContentWritesEnabled(
            user,
        );
    }

    public getLightdashVersion(context: McpProtocolContext): string {
        this.canAccessMcp(context);
        return VERSION;
    }

    private async checkAiAgentsVisible(user: SessionUser) {
        if (!user.organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const settings =
            await this.aiOrganizationSettingsService.getSettings(user);
        if (!settings.aiAgentsVisible) {
            throw new ForbiddenError(
                'AI Agent features are disabled for this organization',
            );
        }
    }

    private trackToolCall(
        context: McpProtocolContext,
        toolName: string,
        projectUuid?: string,
    ): void {
        try {
            const { user, organizationUuid } = McpService.getAccount(context);
            this.analytics.track<McpToolCallEvent>({
                event: 'mcp_tool_call',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    toolName,
                },
            });
        } catch (error) {
            this.logger.debug('Failed to track MCP tool call', error);
        }
    }
}
