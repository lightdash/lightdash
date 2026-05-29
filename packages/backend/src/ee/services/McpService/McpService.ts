import { subject } from '@casl/ability';
import {
    Account,
    AiResultType,
    ApiKeyAccount,
    assertUnreachable,
    buildRunSqlDescription,
    CatalogType,
    clearAgentToolDefinition,
    CommercialFeatureFlags,
    convertAiTableCalcsSchemaToTableCalcs,
    createContentToolDefinition,
    createToolRunSqlArgsSchema,
    editContentToolDefinition,
    Explore,
    FeatureFlags,
    filterExploreByTags,
    findContentToolDefinition,
    findExploresToolDefinition,
    findFieldsToolDefinition,
    ForbiddenError,
    getCurrentAgentToolDefinition,
    getCurrentProjectToolDefinition,
    getItemLabelWithoutTableName,
    getLightdashVersionToolDefinition,
    getQueryResultToolDefinition,
    getSlackAiEchartsConfig,
    getValidAiQueryLimit,
    isExploreError,
    ItemsMap,
    listAgentsToolDefinition,
    listContentToolDefinition,
    listExploresToolDefinition,
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
    runAiWritebackToolDefinition,
    runQueryToolDefinition,
    runSqlToolDefinition,
    searchFieldValuesToolDefinition,
    ServiceAcctAccount,
    SessionUser,
    setAgentToolDefinition,
    setProjectToolDefinition,
    ToolFindContentArgs,
    ToolFindExploresArgsV3,
    ToolFindFieldsArgs,
    toolRunQueryArgsSchemaTransformed,
    ToolRunQueryArgsTransformed,
    ToolSearchFieldValuesArgs,
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
import { z, ZodRawShape } from 'zod';
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
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    mergeUserAttributes,
    validateUserAttributeOverrides,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
import { VERSION } from '../../../version';
import {
    getMcpAnalystPromptWithContext,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { getFindContent } from '../ai/tools/findContent';
import { getFindExplores } from '../ai/tools/findExplores';
import { getFindFields } from '../ai/tools/findFields';
import { getMcpListExplores } from '../ai/tools/mcpListExplores';
import { validateRunQueryTool } from '../ai/tools/runQuery';
import { getSearchFieldValues } from '../ai/tools/searchFieldValues';
import {
    FindContentFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    SearchFieldValuesFn,
} from '../ai/types/aiAgentDependencies';
import { AgentContext } from '../ai/utils/AgentContext';
import { getPivotedResults } from '../ai/utils/getPivotedResults';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { AiAgentService } from '../AiAgentService/AiAgentService';
import { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import { AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { buildMcpExploreConfigState } from './buildMcpExploreConfigState';
import {
    registerAppResource,
    registerAppTool,
    RESOURCE_MIME_TYPE,
} from './mcpAppHelpers';
import { McpSchemaCompatLayer } from './McpSchemaCompatLayer';

export enum McpToolName {
    GET_LIGHTDASH_VERSION = 'get_lightdash_version',
    LIST_EXPLORES = 'list_explores',
    FIND_EXPLORES = 'find_explores',
    FIND_FIELDS = 'find_fields',
    FIND_CONTENT = 'find_content',
    LIST_CONTENT = 'list_content',
    READ_CONTENT = 'read_content',
    CREATE_CONTENT = 'create_content',
    EDIT_CONTENT = 'edit_content',
    LIST_PROJECTS = 'list_projects',
    SET_PROJECT = 'set_project',
    GET_CURRENT_PROJECT = 'get_current_project',
    LIST_AGENTS = 'list_agents',
    SET_AGENT = 'set_agent',
    CLEAR_AGENT = 'clear_agent',
    GET_CURRENT_AGENT = 'get_current_agent',
    RUN_METRIC_QUERY = 'run_metric_query',
    RUN_SQL = 'run_sql',
    GET_QUERY_RESULT = 'get_query_result',
    SEARCH_FIELD_VALUES = 'search_field_values',
    LIST_VERIFIED_CONTENT = 'list_verified_content',
    RUN_AI_WRITEBACK = 'run_ai_writeback',
}

const mcpRunAiWritebackTool = runAiWritebackToolDefinition.for('mcp');
const mcpGetLightdashVersionTool = getLightdashVersionToolDefinition.for('mcp');
const mcpListExploresTool = listExploresToolDefinition.for('mcp');
const mcpFindExploresTool = findExploresToolDefinition.for('mcp');
const mcpFindFieldsTool = findFieldsToolDefinition.for('mcp');
const mcpFindContentTool = findContentToolDefinition.for('mcp');
const mcpListContentTool = listContentToolDefinition.for('mcp');
const mcpReadContentTool = readContentToolDefinition.for('mcp');
const mcpCreateContentTool = createContentToolDefinition.for('mcp');
const mcpEditContentTool = editContentToolDefinition.for('mcp');
const mcpListProjectsTool = mcpListProjectsToolDefinition.for('mcp');
const mcpSetProjectTool = setProjectToolDefinition.for('mcp');
const mcpGetCurrentProjectTool = getCurrentProjectToolDefinition.for('mcp');
const mcpListAgentsTool = listAgentsToolDefinition.for('mcp');
const mcpSetAgentTool = setAgentToolDefinition.for('mcp');
const mcpClearAgentTool = clearAgentToolDefinition.for('mcp');
const mcpGetCurrentAgentTool = getCurrentAgentToolDefinition.for('mcp');
const mcpRunMetricQueryTool = runQueryToolDefinition.for('mcp');
const mcpSearchFieldValuesTool = searchFieldValuesToolDefinition.for('mcp');
const mcpRunSqlTool = runSqlToolDefinition.for('mcp');
const mcpGetQueryResultTool = getQueryResultToolDefinition.for('mcp');
const mcpListVerifiedContentTool = listVerifiedContentToolDefinition.for('mcp');

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

    private aiWritebackService: AiWritebackService;

    private mcpServer: McpServer;

    private mcpCompatLayer: McpSchemaCompatLayer;

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
        this.aiWritebackService = aiWritebackService;
        this.mcpCompatLayer = new McpSchemaCompatLayer();
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

    private async buildScopedResponse(
        context: McpProtocolContext,
        toolResult: string,
        structuredContent?: Record<string, unknown>,
    ) {
        const metadata = await this.getActiveContextMetadata(context);

        const scopeInfo = [
            metadata.agentName ? `Active agent: ${metadata.agentName}` : null,
            metadata.tags
                ? `Filtered by tags: ${metadata.tags.join(', ')}`
                : null,
        ]
            .filter(Boolean)
            .join('. ');

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

    private async buildCompletedMetricQueryResponse({
        ctx,
        projectUuid,
        queryTool,
        query,
        rows,
        fields,
    }: {
        ctx: McpProtocolContext;
        projectUuid: string;
        queryTool: ToolRunQueryArgsTransformed;
        query: MetricQuery;
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    }) {
        if (rows.length === 0) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Query returned 0 rows.',
                    },
                ],
                structuredContent: {
                    result: {
                        status: 'done' as const,
                        rows: [],
                        fields,
                        echartsOption: null,
                        exploreUrl: null,
                    },
                },
            };
        }

        const fieldIds = Object.keys(rows[0]);
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

        const exploreConfigState = buildMcpExploreConfigState({
            queryTool,
            metricQuery: query,
            fieldsMap: fields,
            columnOrder: Object.keys(rows[0] ?? {}),
        });
        const explorePath = `/projects/${projectUuid}/tables/${queryTool.queryConfig.exploreName}`;
        const exploreParams = `?create_saved_chart_version=${encodeURIComponent(
            JSON.stringify(exploreConfigState),
        )}&isExploreFromHere=true`;

        const { user } = McpService.getAccount(ctx);
        const shareUrl = await this.shareService.createShareUrl(
            user,
            explorePath,
            exploreParams,
        );
        const exploreUrl = `${this.lightdashConfig.siteUrl}/share/${shareUrl.nanoid}`;

        const metadata = await this.getActiveContextMetadata(ctx);
        const scopeInfo = [
            metadata.agentName ? `Active agent: ${metadata.agentName}` : null,
            metadata.tags
                ? `Filtered by tags: ${metadata.tags.join(', ')}`
                : null,
        ]
            .filter(Boolean)
            .join('. ');

        const content = [
            {
                type: 'text' as const,
                text: csv,
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
    }: {
        queryUuid: string;
        rows: Record<string, unknown>[];
        fields: ItemsMap;
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
    }: {
        ctx: McpProtocolContext;
        queryUuid: string;
        projectUuid: string;
        pageSize?: number;
        includeStatus: boolean;
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
                    },
                },
            );
        }

        const csv = stringify(rows, {
            header: true,
            columns,
        });

        return this.buildScopedResponse(ctx, csv, {
            result: {
                ...(includeStatus ? { queryUuid } : {}),
                status: 'done' as const,
                rows,
                columns,
                rowCount: rows.length,
            },
        });
    }

    private getMcpCompatibleSchema<TShape extends ZodRawShape>(
        schema: z.ZodObject<TShape>,
    ): TShape {
        return this.mcpCompatLayer.processZodType(schema).shape;
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpRunAiWritebackTool.inputSchema,
                ),
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

    private registerMcpContentAsCodeTools(): void {
        this.mcpServer.registerTool(
            mcpListContentTool.name,
            {
                title: mcpListContentTool.title,
                description: mcpListContentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpListContentTool.inputSchema,
                ),
                annotations: mcpListContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const { listContent } =
                    this.aiAgentService.getContentToolDependencies({
                        user,
                        projectUuid,
                        sentryPrefix: 'McpService',
                    });
                const { page, spaceSlug } =
                    mcpListContentTool.inputSchema.parse(args);

                this.trackToolCall(ctx, McpToolName.LIST_CONTENT, projectUuid);

                const result = await listContent({
                    spaceSlug: spaceSlug ?? null,
                    page: page ?? 1,
                });

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(result, null, 2),
                    result,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpReadContentTool.name,
            {
                title: mcpReadContentTool.title,
                description: mcpReadContentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpReadContentTool.inputSchema,
                ),
                annotations: mcpReadContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const { readContent } =
                    this.aiAgentService.getContentToolDependencies({
                        user,
                        projectUuid,
                        sentryPrefix: 'McpService',
                    });
                const { slug, type } =
                    mcpReadContentTool.inputSchema.parse(args);

                this.trackToolCall(ctx, McpToolName.READ_CONTENT, projectUuid);

                const result = await readContent({ slug, type });

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(result.content, null, 2),
                    result,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpCreateContentTool.name,
            {
                title: mcpCreateContentTool.title,
                description: mcpCreateContentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpCreateContentTool.inputSchema,
                ),
                annotations: mcpCreateContentTool.annotations,
                _meta: mcpCreateContentTool.meta,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const { createContent } =
                    this.aiAgentService.getContentToolDependencies({
                        user,
                        projectUuid,
                        sentryPrefix: 'McpService',
                    });

                this.trackToolCall(
                    ctx,
                    McpToolName.CREATE_CONTENT,
                    projectUuid,
                );

                const result = await createContent(
                    mcpCreateContentTool.inputSchema.parse(args),
                );

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(result.content, null, 2),
                    result,
                );
            },
        );

        this.mcpServer.registerTool(
            mcpEditContentTool.name,
            {
                title: mcpEditContentTool.title,
                description: mcpEditContentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpEditContentTool.inputSchema,
                ),
                annotations: mcpEditContentTool.annotations,
                _meta: mcpEditContentTool.meta,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);
                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);
                const { editContent } =
                    this.aiAgentService.getContentToolDependencies({
                        user,
                        projectUuid,
                        sentryPrefix: 'McpService',
                    });

                this.trackToolCall(ctx, McpToolName.EDIT_CONTENT, projectUuid);

                const result = await editContent(
                    mcpEditContentTool.inputSchema.parse(args),
                );

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(result.content, null, 2),
                    result,
                );
            },
        );
    }

    setupHandlers(
        options: {
            projectPinned: boolean;
            aiWritebackEnabled: boolean;
            mcpContentAsCodeEnabled: boolean;
        } = {
            projectPinned: false,
            aiWritebackEnabled: false,
            mcpContentAsCodeEnabled: false,
        },
    ): void {
        this.mcpServer.registerTool(
            mcpGetLightdashVersionTool.name,
            {
                title: mcpGetLightdashVersionTool.title,
                description: mcpGetLightdashVersionTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpGetLightdashVersionTool.inputSchema,
                ),
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpListExploresTool.inputSchema,
                ),
                annotations: mcpListExploresTool.annotations,
            },
            async (_args, extra) => {
                try {
                    const ctx = getMcpContext(extra);

                    const { user } = McpService.getAccount(ctx);

                    const projectUuid = await this.resolveProjectUuid(ctx);

                    this.trackToolCall(
                        ctx,
                        McpToolName.LIST_EXPLORES,
                        projectUuid,
                    );

                    const tagsFromContext = await this.getTagsFromContext(ctx);

                    const userAttributeOverrides =
                        await this.getUserAttributeOverridesFromContext(ctx);

                    const listExplores = async () =>
                        this.getAvailableExplores(
                            user,
                            projectUuid,
                            tagsFromContext,
                            userAttributeOverrides,
                        );

                    const listExploresTool = getMcpListExplores({
                        listExplores,
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpFindExploresTool.inputSchema,
                ),
                annotations: mcpFindExploresTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_EXPLORES, projectUuid);

                const findExplores: FindExploresFn =
                    await this.getFindExploresFunction(argsWithProject, ctx);

                const { user } = McpService.getAccount(ctx);

                const tagsFromContext = await this.getTagsFromContext(ctx);
                const userAttributeOverrides =
                    await this.getUserAttributeOverridesFromContext(ctx);
                const availableExplores = await this.getAvailableExplores(
                    user,
                    argsWithProject.projectUuid,
                    tagsFromContext,
                    userAttributeOverrides,
                );

                const findExploresTool = getFindExplores({
                    findExplores,
                    updateProgress: async () => {}, // No-op for MCP context
                    fieldSearchSize: 200,
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

                return this.buildScopedResponse(
                    ctx,
                    await McpService.streamToolResult(result),
                );
            },
        );

        this.mcpServer.registerTool(
            mcpFindFieldsTool.name,
            {
                title: mcpFindFieldsTool.title,
                description: mcpFindFieldsTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpFindFieldsTool.inputSchema,
                ),
                annotations: mcpFindFieldsTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_FIELDS, projectUuid);

                const { findFields, getExplore } =
                    await this.getFindFieldsFunction(argsWithProject, ctx);

                const findFieldsTool = getFindFields({
                    getExplore,
                    findFields,
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
                );
            },
        );

        this.mcpServer.registerTool(
            mcpFindContentTool.name,
            {
                title: mcpFindContentTool.title,
                description: mcpFindContentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpFindContentTool.inputSchema,
                ),
                annotations: mcpFindContentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, McpToolName.FIND_CONTENT, projectUuid);

                const findContent: FindContentFn =
                    await this.getFindContentFunction(argsWithProject, ctx);

                const findContentTool = getFindContent({
                    findContent,
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
                );
            },
        );

        // When the project is pinned via header, hide the project-selection
        // tools so clients can't change context for a request-scoped pin.
        if (!options.projectPinned) {
            this.mcpServer.registerTool(
                mcpListProjectsTool.name,
                {
                    title: mcpListProjectsTool.title,
                    description: mcpListProjectsTool.description,
                    inputSchema: this.getMcpCompatibleSchema(
                        mcpListProjectsTool.inputSchema,
                    ),
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
                    inputSchema: this.getMcpCompatibleSchema(
                        mcpSetProjectTool.inputSchema,
                    ),
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpGetCurrentProjectTool.inputSchema,
                ),
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpListAgentsTool.inputSchema,
                ),
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
            mcpSetAgentTool.name,
            {
                title: mcpSetAgentTool.title,
                description: mcpSetAgentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpSetAgentTool.inputSchema,
                ),
                annotations: mcpSetAgentTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, McpToolName.SET_AGENT, args.agentUuid);

                if (!args.agentUuid) {
                    throw new ParameterError('Agent UUID is required');
                }

                const projectUuid = await this.resolveProjectUuid(ctx);

                // Validates copilot enabled, agent exists, user has access, and returns summary context
                const agent = await this.aiAgentService.getAgent(
                    user,
                    args.agentUuid,
                    projectUuid,
                    { includeSummaryContext: true },
                );

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
                        agentUuid: agent.uuid,
                        agentName: agent.name,
                    },
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    agentUuid: agent.uuid,
                                    agentName: agent.name,
                                    agentDescription: agent.description,
                                    agentTags: agent.tags,
                                    agentProjectUuid: agent.projectUuid,
                                    explores: agent.context.explores,
                                    verifiedQuestions:
                                        agent.context.verifiedQuestions,
                                    instruction: agent.context.instruction,
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
            mcpClearAgentTool.name,
            {
                title: mcpClearAgentTool.title,
                description: mcpClearAgentTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpClearAgentTool.inputSchema,
                ),
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpGetCurrentAgentTool.inputSchema,
                ),
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
                                {
                                    agentUuid: agent.uuid,
                                    agentName: agent.name,
                                    agentDescription: agent.description,
                                    agentTags: agent.tags,
                                    agentProjectUuid: agent.projectUuid,
                                    explores: agent.context.explores,
                                    verifiedQuestions:
                                        agent.context.verifiedQuestions,
                                    instruction: agent.context.instruction,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        // Register chart app resource for the MCP App UI
        const chartResourceUri = 'ui://run-metric-query/chart.html';
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

        registerAppTool(
            this.mcpServer,
            mcpRunMetricQueryTool.name,
            {
                title: mcpRunMetricQueryTool.title,
                description: mcpRunMetricQueryTool.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpRunMetricQueryTool.inputSchema,
                ),
                outputSchema: mcpRunMetricQueryTool.outputSchema,
                annotations: mcpRunMetricQueryTool.annotations,
                _meta: { ui: { resourceUri: chartResourceUri } },
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
                    const { agentContext, userAttributeOverrides } =
                        await this.getRunMetricQueryDependencies(
                            { projectUuid },
                            ctx,
                        );

                    const queryTool =
                        toolRunQueryArgsSchemaTransformed.parse(
                            argsWithProject,
                        );
                    const explore = agentContext.getExplore(
                        queryTool.queryConfig.exploreName,
                    );

                    // Full validation including groupBy, axis, and tableCalcs
                    validateRunQueryTool(queryTool, explore);

                    const maxLimit =
                        this.lightdashConfig.ai.copilot.maxQueryLimit;

                    const additionalMetrics = populateCustomMetricsSQL(
                        queryTool.customMetrics,
                        explore,
                    );

                    const query = {
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
                        filters: queryTool.filters,
                        additionalMetrics,
                        tableCalculations:
                            convertAiTableCalcsSchemaToTableCalcs(
                                queryTool.tableCalculations,
                            ),
                    };

                    const { queryUuid } =
                        await this.asyncQueryService.executeAsyncMetricQuery({
                            account,
                            projectUuid,
                            metricQuery: {
                                ...query,
                                additionalMetrics,
                            },
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

                    return await this.buildCompletedMetricQueryResponse({
                        ctx,
                        projectUuid,
                        queryTool,
                        query,
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
                                text: `Error running metric query: ${errorMessage}`,
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpSearchFieldValuesTool.inputSchema,
                ),
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

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        ctx,
                    );

                const searchFieldValuesTool = getSearchFieldValues({
                    searchFieldValues,
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
                inputSchema: this.getMcpCompatibleSchema(runSqlArgsSchema),
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

                    return await this.buildSqlQueryResultResponse({
                        ctx,
                        queryUuid,
                        projectUuid,
                        pageSize: args.limit ?? 500,
                        includeStatus: false,
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpGetQueryResultTool.inputSchema,
                ),
                outputSchema: mcpGetQueryResultTool.outputSchema,
                annotations: mcpGetQueryResultTool.annotations,
            },
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { account } = McpService.getAccount(ctx);
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
                        );
                    }

                    if (isMcpSqlQuery) {
                        return await this.buildSqlQueryResultResponse({
                            ctx,
                            queryUuid: args.queryUuid,
                            projectUuid,
                            includeStatus: true,
                        });
                    }

                    if (isMcpMetricQuery) {
                        const results =
                            await this.asyncQueryService.getRawAsyncQueryResults(
                                {
                                    account,
                                    projectUuid,
                                    queryUuid: args.queryUuid,
                                },
                            );

                        return McpService.buildMetricQueryPollResult({
                            queryUuid: args.queryUuid,
                            rows: results.rows,
                            fields: results.fields,
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
                inputSchema: this.getMcpCompatibleSchema(
                    mcpListVerifiedContentTool.inputSchema,
                ),
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

                const verifiedContent =
                    await this.contentVerificationService.listVerifiedContent(
                        user,
                        projectUuid,
                    );

                return this.buildScopedResponse(
                    ctx,
                    JSON.stringify(verifiedContent, null, 2),
                );
            },
        );

        // Dark-launched: these tools are only registered — and therefore only
        // advertised in tools/list and invocable — when the MCP content-as-code
        // feature flag is enabled for the caller. The flag is resolved
        // per-request in the MCP router (mcpRouter.ts) and passed through
        // createServer.
        if (options.mcpContentAsCodeEnabled) {
            this.registerMcpContentAsCodeTools();
        }

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
                    'Guidelines for querying Lightdash data using MCP tools. Includes explore selection, query building, visualization rules, and active agent context (instructions, verified questions, available explores). Inject this into your system prompt for best results.',
                argsSchema: {},
            },
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const metadata = await this.getActiveContextMetadata(ctx);
                const { user } = McpService.getAccount(ctx);

                let promptText: string;

                if (metadata.agentUuid) {
                    try {
                        const agent = await this.aiAgentService.getAgent(
                            user,
                            metadata.agentUuid,
                            undefined,
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

    async getTagsFromContext(context: McpProtocolContext) {
        const user = context.authInfo?.extra.user;

        if (!user || !user.organizationUuid) {
            return null;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        return contextRow?.context.tags || null;
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

    async getAvailableExplores(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        userAttributeOverrides?: UserAttributeValueMap,
        exploreNames?: string[],
    ) {
        return wrapSentryTransaction(
            'AiAgent.getAvailableExplores',
            {
                projectUuid,
                availableTags,
                exploreNames,
            },
            async () => {
                const { organizationUuid } = user;
                if (!organizationUuid) {
                    throw new ForbiddenError('Organization not found');
                }

                const dbAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        { organizationUuid, userUuid: user.userUuid },
                    );

                const userAttributes = mergeUserAttributes(
                    dbAttributes,
                    userAttributeOverrides,
                );

                const allExplores = Object.values(
                    await this.projectModel.findExploresFromCache(
                        projectUuid,
                        'name',
                        exploreNames,
                    ),
                );

                return allExplores
                    .filter(
                        (explore): explore is Explore =>
                            !isExploreError(explore),
                    )
                    .filter((explore) =>
                        doesExploreMatchRequiredAttributes(
                            explore.tables[explore.baseTable]
                                .requiredAttributes,
                            explore.tables[explore.baseTable].anyAttributes,
                            userAttributes,
                        ),
                    )
                    .map((explore) =>
                        getFilteredExplore(explore, userAttributes),
                    )
                    .filter((explore) =>
                        filterExploreByTags({ explore, availableTags }),
                    )
                    .filter((explore): explore is Explore => !!explore);
            },
        );
    }

    private async getExplore(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        exploreName: string,
        userAttributeOverrides?: UserAttributeValueMap,
    ) {
        const [explore] = await this.getAvailableExplores(
            user,
            projectUuid,
            availableTags,
            userAttributeOverrides,
            [exploreName],
        );
        if (!explore) {
            throw new NotFoundError('Explore not found');
        }

        return explore;
    }

    async getFindExploresFunction(
        toolArgs: Omit<ToolFindExploresArgsV3, 'type'> & {
            projectUuid: string;
        },
        context: McpProtocolContext,
    ): Promise<FindExploresFn> {
        const { user, account } = McpService.getAccount(context);
        const { projectUuid } = toolArgs;

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

        // Get tags from context for filtering
        const tagsFromContext = await this.getTagsFromContext(context);

        // Get merged user attributes (DB + session overrides)
        const userAttributes = await this.getMergedUserAttributes(context);

        const findExplores: FindExploresFn = (args) =>
            wrapSentryTransaction('McpService.findExplores', args, async () => {
                const searchResults = await this.catalogService.searchCatalog({
                    projectUuid,
                    userAttributes,
                    catalogSearch: {
                        searchQuery: args.searchQuery,
                        type: CatalogType.Table,
                        catalogTags: tagsFromContext || undefined,
                    },
                    context: CatalogSearchContext.MCP,
                    paginateArgs: {
                        page: 1,
                        pageSize: 15,
                    },
                    fullTextSearchOperator: 'OR',
                });

                const exploreSearchResults = searchResults.data
                    .filter((item) => item.type === CatalogType.Table)
                    .map((table) => ({
                        name: table.name,
                        label: table.label,
                        description: table.description,
                        aiHints: table.aiHints ?? undefined,
                        searchRank: table.searchRank,
                        joinedTables: table.joinedTables ?? undefined,
                    }));

                const fieldSearchResults =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        userAttributes,
                        catalogSearch: {
                            searchQuery: args.searchQuery,
                            type: CatalogType.Field,
                            catalogTags: tagsFromContext || undefined,
                        },
                        context: CatalogSearchContext.MCP,
                        paginateArgs: {
                            page: 1,
                            pageSize: 50,
                        },
                        fullTextSearchOperator: 'OR',
                    });

                const topMatchingFields = fieldSearchResults.data
                    .filter((item) => item.type === CatalogType.Field)
                    .map((field) => ({
                        name: field.name,
                        label: field.label,
                        tableName: field.tableName,
                        fieldType: field.fieldType,
                        searchRank: field.searchRank,
                        description: field.description,
                    }));

                return {
                    exploreSearchResults,
                    topMatchingFields,
                };
            });

        return findExplores;
    }

    async getFindFieldsFunction(
        toolArgs: Omit<ToolFindFieldsArgs, 'type'> & { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<{ findFields: FindFieldFn; getExplore: GetExploreFn }> {
        const { user, account } = McpService.getAccount(context);
        const { projectUuid } = toolArgs;

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

        // Get tags from context for filtering
        const tagsFromContext = await this.getTagsFromContext(context);

        // Get merged user attributes (DB + session overrides)
        const userAttributes = await this.getMergedUserAttributes(context);
        const userAttributeOverrides =
            await this.getUserAttributeOverridesFromContext(context);

        const getExplore: GetExploreFn = async ({ table }) =>
            this.getExplore(
                user,
                projectUuid,
                tagsFromContext,
                table,
                userAttributeOverrides,
            );

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('McpService.findFields', args, async () => {
                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Field,
                            searchQuery: args.fieldSearchQuery.label,
                        },
                        context: CatalogSearchContext.MCP,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        userAttributes,
                        fullTextSearchOperator: 'OR',
                        filteredExplores: [args.explore],
                    });

                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );

                return { fields: catalogFields, pagination };
            });

        return { findFields, getExplore };
    }

    async getFindContentFunction(
        toolArgs: Omit<ToolFindContentArgs, 'type'> & { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<FindContentFn> {
        const { user, account } = McpService.getAccount(context);
        const { projectUuid } = toolArgs;

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

        const findContent: FindContentFn = (args) =>
            wrapSentryTransaction('McpService.findContent', args, async () => {
                const dashboardSearchResults =
                    await this.searchModel.searchDashboards(
                        projectUuid,
                        args.searchQuery.label,
                        undefined,
                        'OR',
                    );

                const chartSearchResults =
                    await this.searchModel.searchAllCharts(
                        projectUuid,
                        args.searchQuery.label,
                        'OR',
                    );

                const allContent = [
                    ...dashboardSearchResults,
                    ...chartSearchResults,
                ];

                const filteredResults =
                    await this.spaceService.filterBySpaceAccess(
                        user,
                        allContent,
                    );

                return {
                    content: filteredResults,
                };
            });

        return findContent;
    }

    async getRunMetricQueryDependencies(
        toolArgs: { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<{
        agentContext: AgentContext;
        userAttributeOverrides: UserAttributeValueMap | undefined;
    }> {
        const { user, account } = McpService.getAccount(context);
        const { projectUuid } = toolArgs;

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

        // Get tags from context and fetch available explores
        const tagsFromContext = await this.getTagsFromContext(context);
        const userAttributeOverrides =
            await this.getUserAttributeOverridesFromContext(context);
        const explores = await this.getAvailableExplores(
            user,
            projectUuid,
            tagsFromContext,
            userAttributeOverrides,
        );
        const agentContext = new AgentContext(explores);

        return { agentContext, userAttributeOverrides };
    }

    async getSearchFieldValuesFunction(
        toolArgs: Omit<ToolSearchFieldValuesArgs, 'type'> & {
            projectUuid: string;
        },
        context: McpProtocolContext,
    ): Promise<SearchFieldValuesFn> {
        const { user, account } = McpService.getAccount(context);
        const { projectUuid } = toolArgs;

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

        // Get user attribute overrides for row-level security
        const userAttributeOverrides =
            await this.getUserAttributeOverridesFromContext(context);

        const searchFieldValues: SearchFieldValuesFn = (args) =>
            wrapSentryTransaction(
                'McpService.searchFieldValues',
                args,
                async () => {
                    const dimensionFilters = args.filters?.dimensions;
                    const andFilters =
                        dimensionFilters && 'and' in dimensionFilters
                            ? dimensionFilters
                            : undefined;

                    const results =
                        await this.projectService.searchFieldUniqueValues(
                            user,
                            projectUuid,
                            args.table,
                            args.fieldId,
                            args.query,
                            100,
                            andFilters,
                            false,
                            undefined,
                            userAttributeOverrides,
                            QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
                        );
                    return results;
                },
            );

        return searchFieldValues;
    }

    public getServer(): McpServer {
        return this.mcpServer;
    }

    /**
     * Creates a new McpServer instance with all handlers registered.
     * Required for SDK 1.26.0+ stateful mode where each session needs its own server.
     * See: https://github.com/advisories/GHSA-345p-7cg4-v4c7
     */
    public createServer(options?: {
        projectPinned?: boolean;
        aiWritebackEnabled?: boolean;
        mcpContentAsCodeEnabled?: boolean;
    }): McpServer {
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

        // Temporarily swap the server to register handlers on the new instance
        const originalServer = this.mcpServer;
        this.mcpServer = newServer;
        this.setupHandlers({
            projectPinned: options?.projectPinned ?? false,
            aiWritebackEnabled: options?.aiWritebackEnabled ?? false,
            mcpContentAsCodeEnabled: options?.mcpContentAsCodeEnabled ?? false,
        });
        this.mcpServer = originalServer;

        return newServer;
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

    public async isMcpContentAsCodeEnabled(
        user: SessionUser,
        projectUuid?: string,
    ): Promise<boolean> {
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.McpContentAsCode,
        });
        if (!flag.enabled) {
            return false;
        }

        if (!user.organizationUuid) {
            return false;
        }

        if (!projectUuid) {
            return true;
        }

        const auditedAbility = this.createAuditedAbility(user);
        return auditedAbility.can(
            'manage',
            subject('ContentAsCode', {
                organizationUuid: user.organizationUuid,
                projectUuid,
            }),
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
