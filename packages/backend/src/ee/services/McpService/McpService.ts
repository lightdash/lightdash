import { subject } from '@casl/ability';
import {
    Account,
    AiResultType,
    ApiKeyAccount,
    CatalogType,
    clearAgentTool,
    CommercialFeatureFlags,
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    filterExploreByTags,
    findContentTool,
    findExploresTool,
    findFieldsTool,
    ForbiddenError,
    getCurrentAgentTool,
    getCurrentProjectTool,
    getItemLabelWithoutTableName,
    getLightdashVersionTool,
    getSlackAiEchartsConfig,
    getValidAiQueryLimit,
    isExploreError,
    JobPollTimeoutError,
    listAgentsTool,
    listExploresTool,
    listProjectsTool,
    listVerifiedContentTool,
    MissingConfigError,
    NotFoundError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    RUN_METRIC_QUERY_CHART_RESOURCE_URI,
    runQueryTool,
    runSqlTool,
    SchedulerJobStatus,
    searchFieldValuesTool,
    ServiceAcctAccount,
    SessionUser,
    setAgentTool,
    setProjectTool,
    ToolDefinition,
    ToolInput,
    UserAttributeValueMap,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/extensions
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
    CallToolRequestSchema,
    RequestInfo,
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
import { SavedSqlService } from '../../../services/SavedSqlService/SavedSqlService';
import { SchedulerService } from '../../../services/SchedulerService/SchedulerService';
import { ShareService } from '../../../services/ShareService/ShareService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
    mergeUserAttributes,
    validateUserAttributeOverrides,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
import { streamJsonlData } from '../../../utils/FileDownloadUtils/FileDownloadUtils';
import { VERSION } from '../../../version';
import {
    getMcpAnalystPromptWithContext,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { NO_RESULTS_RETRY_PROMPT } from '../ai/prompts/noResultsRetry';
import { BuiltInSkills } from '../ai/skills/builtInSkills';
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
    RunAsyncQueryFn,
    SearchFieldValuesFn,
} from '../ai/types/aiAgentDependencies';
import { AgentContext } from '../ai/utils/AgentContext';
import { getPivotedResults } from '../ai/utils/getPivotedResults';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../ai/utils/populateCustomMetricsSQL';
import { serializeData } from '../ai/utils/serializeData';
import { AiAgentService } from '../AiAgentService/AiAgentService';
import { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import {
    registerAppResource,
    registerAppTool,
    RESOURCE_MIME_TYPE,
} from './mcpAppHelpers';

type ToolFindContentArgs = ToolInput<typeof findContentTool>;
type ToolFindFieldsArgs = ToolInput<typeof findFieldsTool>;
type ToolFindExploresArgsV3 = ToolInput<typeof findExploresTool>;

const MCP_SKILL_RESOURCE_MIME_TYPE = 'text/markdown';

type McpClientMetadata = {
    anthropicClient?: string;
    clientSource?: string;
    protocolVersion?: string;
    userAgent?: string;
};

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    contentVerificationService: ContentVerificationService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    savedSqlService: SavedSqlService;
    schedulerService: SchedulerService;
    shareService: ShareService;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    spaceService: SpaceService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
    aiOrganizationSettingsService: AiOrganizationSettingsService;
    aiAgentService: AiAgentService;
};

export type ExtraContext = {
    user: SessionUser;
    account: OauthAccount | ApiKeyAccount | ServiceAcctAccount;
    /** User attribute overrides passed via X-Lightdash-User-Attributes header */
    headerUserAttributes?: UserAttributeValueMap;
    /** Project UUID passed via X-Lightdash-Project header; overrides stored context */
    headerProjectUuid?: string;
    mcpClientMetadata?: McpClientMetadata;
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
    mcpClientMetadata: z.custom<McpClientMetadata>().optional(),
});

const mcpProtocolContextSchema = z.object({
    authInfo: z
        .intersection(
            z.custom<AuthInfo>(),
            z.object({ extra: extraContextSchema }),
        )
        .optional(),
    requestInfo: z.custom<RequestInfo>().optional(),
    _meta: z.record(z.unknown()).optional(),
});

type McpProtocolContext = z.infer<typeof mcpProtocolContextSchema>;

const getRequestHeader = (
    requestInfo: RequestInfo | undefined,
    headerName: string,
): string | undefined => {
    const headerValue = requestInfo?.headers[headerName.toLowerCase()];

    if (Array.isArray(headerValue)) {
        return headerValue[0];
    }

    return headerValue;
};

const CLAUDE_CODE_TOOL_USE_ID_META_KEY = 'claudecode/toolUseId';
const CODEX_TURN_METADATA_META_KEY = 'x-codex-turn-metadata';

const getMcpClientSource = (
    requestInfo: RequestInfo | undefined,
    _meta: McpProtocolContext['_meta'],
): string | undefined => {
    if (_meta?.[CLAUDE_CODE_TOOL_USE_ID_META_KEY] !== undefined) {
        return 'claudecode';
    }
    if (_meta?.[CODEX_TURN_METADATA_META_KEY] !== undefined) {
        return 'codex';
    }
    if (
        getRequestHeader(requestInfo, 'x-openai-session') !== undefined ||
        _meta?.['openai/session'] !== undefined
    ) {
        return 'openai';
    }

    return undefined;
};

const getMcpClientMetadata = ({
    requestInfo,
    _meta,
}: Pick<McpProtocolContext, 'requestInfo' | '_meta'>): McpClientMetadata => {
    const userAgent = getRequestHeader(requestInfo, 'user-agent');
    const anthropicClient = getRequestHeader(requestInfo, 'x-anthropic-client');
    const protocolVersion = getRequestHeader(
        requestInfo,
        'mcp-protocol-version',
    );
    const clientSource = getMcpClientSource(requestInfo, _meta);

    return {
        anthropicClient,
        clientSource,
        protocolVersion,
        userAgent:
            userAgent && anthropicClient
                ? `${userAgent} (${anthropicClient})`
                : userAgent,
    };
};

const getMcpContext = (
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): McpProtocolContext => mcpProtocolContextSchema.parse(extra);

// Shape of `scheduler_log.details` written by the run-SQL scheduler task on
// COMPLETED / ERROR. Loosely typed in the DB (Record<string, any> | null), so
// we validate at the read boundary instead of casting.
const sqlJobCompletedDetailsSchema = z.object({
    fileUrl: z.string(),
    columns: z.array(z.object({ reference: z.string() })).nullish(),
});

const sqlJobErrorDetailsSchema = z.object({
    error: z.string().optional(),
});

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private analytics: LightdashAnalytics;

    private asyncQueryService: AsyncQueryService;

    private catalogService: CatalogService;

    private contentVerificationService: ContentVerificationService;

    private projectService: ProjectService;

    private savedSqlService: SavedSqlService;

    private schedulerService: SchedulerService;

    private projectModel: ProjectModel;

    private userAttributesModel: UserAttributesModel;

    private searchModel: SearchModel;

    private spaceService: SpaceService;

    private mcpContextModel: McpContextModel;

    private shareService: ShareService;

    private featureFlagService: FeatureFlagService;

    private aiOrganizationSettingsService: AiOrganizationSettingsService;

    private aiAgentService: AiAgentService;

    private mcpServer: McpServer;

    constructor({
        lightdashConfig,
        analytics,
        asyncQueryService,
        catalogService,
        contentVerificationService,
        projectService,
        savedSqlService,
        schedulerService,
        shareService,
        userAttributesModel,
        searchModel,
        spaceService,
        projectModel,
        mcpContextModel,
        featureFlagService,
        aiOrganizationSettingsService,
        aiAgentService,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.asyncQueryService = asyncQueryService;
        this.catalogService = catalogService;
        this.contentVerificationService = contentVerificationService;
        this.projectService = projectService;
        this.savedSqlService = savedSqlService;
        this.schedulerService = schedulerService;
        this.shareService = shareService;
        this.userAttributesModel = userAttributesModel;
        this.searchModel = searchModel;
        this.projectModel = projectModel;
        this.spaceService = spaceService;
        this.mcpContextModel = mcpContextModel;
        this.featureFlagService = featureFlagService;
        this.aiOrganizationSettingsService = aiOrganizationSettingsService;
        this.aiAgentService = aiAgentService;
        try {
            this.mcpServer = this.createMcpServer();
            this.setupHandlers();
        } catch (error) {
            this.logger.error('Error initializing MCP server:', error);
            throw error;
        }
    }

    private createMcpServer(): McpServer {
        const mcpServer = Sentry.wrapMcpServerWithSentry(
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

        const originalSetRequestHandler =
            mcpServer.server.setRequestHandler.bind(mcpServer.server);

        const wrappedSetRequestHandler: typeof originalSetRequestHandler = (
            requestSchema,
            handler,
        ) => {
            if (Object.is(requestSchema, CallToolRequestSchema)) {
                return originalSetRequestHandler(
                    requestSchema,
                    async (request, extra) => {
                        const context =
                            mcpProtocolContextSchema.safeParse(extra);
                        if (context.success && context.data.authInfo) {
                            context.data.authInfo.extra.mcpClientMetadata =
                                getMcpClientMetadata(context.data);
                        }

                        return handler(request, extra);
                    },
                );
            }

            return originalSetRequestHandler(requestSchema, handler);
        };

        mcpServer.server.setRequestHandler = wrappedSetRequestHandler;

        return mcpServer;
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

    setupHandlers(
        options: { projectPinned: boolean } = { projectPinned: false },
    ): void {
        const getLightdashVersionMcp = ToolDefinition.toMcpRegistration(
            getLightdashVersionTool,
        );
        this.mcpServer.registerTool(
            getLightdashVersionMcp.name,
            getLightdashVersionMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                this.trackToolCall(ctx, getLightdashVersionMcp.name);
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

        const listExploresMcp =
            ToolDefinition.toMcpRegistration(listExploresTool);
        this.mcpServer.registerTool(
            listExploresMcp.name,
            listExploresMcp.registration,
            async (_args, extra) => {
                try {
                    const ctx = getMcpContext(extra);

                    const { user } = McpService.getAccount(ctx);

                    const projectUuid = await this.resolveProjectUuid(ctx);

                    this.trackToolCall(ctx, listExploresMcp.name, projectUuid);

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

                    const mcpListExploresAgentTool = getMcpListExplores({
                        listExplores,
                    });

                    const result = await mcpListExploresAgentTool.execute!(
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

        const findExploresMcp =
            ToolDefinition.toMcpRegistration(findExploresTool);
        this.mcpServer.registerTool(
            findExploresMcp.name,
            findExploresMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, findExploresMcp.name, projectUuid);

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

                const findExploresAgentTool = getFindExplores({
                    findExplores,
                    updateProgress: async () => {}, // No-op for MCP context
                    fieldSearchSize: 200,
                });
                const result = await findExploresAgentTool.execute!(
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

        const findFieldsMcp = ToolDefinition.toMcpRegistration(findFieldsTool);
        this.mcpServer.registerTool(
            findFieldsMcp.name,
            findFieldsMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, findFieldsMcp.name, projectUuid);

                const { findFields, getExplore } =
                    await this.getFindFieldsFunction(argsWithProject, ctx);

                const findFieldsAgentTool = getFindFields({
                    getExplore,
                    findFields,
                    updateProgress: async () => {}, // No-op for MCP context
                    pageSize: 15,
                });
                const result = await findFieldsAgentTool.execute!(
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

        const findContentMcp =
            ToolDefinition.toMcpRegistration(findContentTool);
        this.mcpServer.registerTool(
            findContentMcp.name,
            findContentMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, findContentMcp.name, projectUuid);

                const findContent: FindContentFn =
                    await this.getFindContentFunction(argsWithProject, ctx);

                const findContentAgentTool = getFindContent({
                    findContent,
                    siteUrl: this.lightdashConfig.siteUrl,
                    trackCoverage: () => {},
                });
                const result = await findContentAgentTool.execute!(
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

        // When the project is pinned via header, hide the project-selection
        // tools so clients can't change context for a request-scoped pin.
        if (!options.projectPinned) {
            const listProjectsMcp =
                ToolDefinition.toMcpRegistration(listProjectsTool);
            this.mcpServer.registerTool(
                listProjectsMcp.name,
                listProjectsMcp.registration,
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

                    this.trackToolCall(ctx, listProjectsMcp.name);

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

            const setProjectMcp =
                ToolDefinition.toMcpRegistration(setProjectTool);
            this.mcpServer.registerTool(
                setProjectMcp.name,
                setProjectMcp.registration,
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
                        setProjectMcp.name,
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

        const getCurrentProjectMcp = ToolDefinition.toMcpRegistration(
            getCurrentProjectTool,
        );
        this.mcpServer.registerTool(
            getCurrentProjectMcp.name,
            getCurrentProjectMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                this.trackToolCall(ctx, getCurrentProjectMcp.name);

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

        const listAgentsMcp = ToolDefinition.toMcpRegistration(listAgentsTool);
        this.mcpServer.registerTool(
            listAgentsMcp.name,
            listAgentsMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, listAgentsMcp.name);

                const agents = await this.aiAgentService.listAgents(
                    user,
                    args.projectUuid,
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

        const setAgentMcp = ToolDefinition.toMcpRegistration(setAgentTool);
        this.mcpServer.registerTool(
            setAgentMcp.name,
            setAgentMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, setAgentMcp.name, args.agentUuid);

                if (!args.agentUuid) {
                    throw new ParameterError('Agent UUID is required');
                }

                // Validates copilot enabled, agent exists, user has access, and returns summary context
                const agent = await this.aiAgentService.getAgent(
                    user,
                    args.agentUuid,
                    undefined,
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

        const clearAgentMcp = ToolDefinition.toMcpRegistration(clearAgentTool);
        this.mcpServer.registerTool(
            clearAgentMcp.name,
            clearAgentMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                this.trackToolCall(ctx, clearAgentMcp.name);

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

        const getCurrentAgentMcp =
            ToolDefinition.toMcpRegistration(getCurrentAgentTool);
        this.mcpServer.registerTool(
            getCurrentAgentMcp.name,
            getCurrentAgentMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, organizationUuid } = McpService.getAccount(ctx);

                await this.checkAiAgentsVisible(user);

                this.trackToolCall(ctx, getCurrentAgentMcp.name);

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
        const chartResourceUri = RUN_METRIC_QUERY_CHART_RESOURCE_URI;
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

        const runMetricQueryMcp =
            ToolDefinition.toMcpRegistration(runQueryTool);
        registerAppTool(
            this.mcpServer,
            runMetricQueryMcp.name,
            runMetricQueryMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ..._args, projectUuid };

                this.trackToolCall(ctx, runMetricQueryMcp.name, projectUuid);

                try {
                    const { agentContext, runAsyncQuery } =
                        await this.getRunMetricQueryDependencies(
                            { projectUuid },
                            ctx,
                        );

                    const queryTool =
                        runQueryTool.inputSchemaTransformed.parse(
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

                    const results = await runAsyncQuery(
                        query,
                        additionalMetrics,
                    );

                    if (results.rows.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: NO_RESULTS_RETRY_PROMPT,
                                },
                            ],
                        };
                    }

                    // Generate CSV text (backward compatible for non-UI clients)
                    const fieldIds = Object.keys(results.rows[0]);
                    const csvHeaders = fieldIds.map((fieldId) => {
                        const item = results.fields[fieldId];
                        if (!item) return fieldId;
                        return getItemLabelWithoutTableName(item);
                    });
                    const csvRows = results.rows.map((row) =>
                        CsvService.convertRowToCsv(
                            row,
                            results.fields,
                            true,
                            fieldIds,
                        ),
                    );
                    const csv = stringify(csvRows, {
                        header: true,
                        columns: csvHeaders,
                    });

                    // Generate ECharts config using the shared AI chart
                    // config — supports bar, line, scatter, pie, funnel,
                    // horizontal bar, groupBy pivots, and secondary axes.
                    const echartsOption = await getSlackAiEchartsConfig({
                        toolArgs: {
                            type: AiResultType.QUERY_RESULT,
                            tool: queryTool,
                        },
                        queryResults: {
                            rows: results.rows,
                            fields: results.fields,
                        },
                        getPivotedResults,
                    });

                    // Override Slack-specific settings for interactive MCP App
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

                    // Build "Explore from here" URL
                    const exploreConfigState = {
                        tableName: queryTool.queryConfig.exploreName,
                        metricQuery: {
                            exploreName: queryTool.queryConfig.exploreName,
                            dimensions: queryTool.queryConfig.dimensions,
                            metrics: query.metrics,
                            sorts: queryTool.queryConfig.sorts,
                            limit: query.limit,
                            filters: queryTool.filters ?? {},
                            additionalMetrics,
                            tableCalculations: query.tableCalculations,
                        },
                        tableConfig: {
                            columnOrder: Object.keys(results.rows[0] ?? {}),
                        },
                        chartConfig: {
                            type: 'table' as const,
                            config: {
                                showColumnCalculation: false,
                                showRowCalculation: false,
                                showTableNames: true,
                                showResultsTotal: false,
                                showSubtotals: false,
                                columns: {},
                                hideRowNumbers: false,
                                conditionalFormattings: [],
                                metricsAsRows: false,
                            },
                        },
                    };
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
                        metadata.agentName
                            ? `Active agent: ${metadata.agentName}`
                            : null,
                        metadata.tags
                            ? `Filtered by tags: ${metadata.tags.join(', ')}`
                            : null,
                    ]
                        .filter(Boolean)
                        .join('. ');

                    const content = [
                        {
                            type: 'text' as const,
                            text: serializeData(csv, 'csv'),
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
                            rows: results.rows,
                            fields: results.fields,
                            echartsOption: mcpEchartsOption,
                            exploreUrl,
                        },
                    };
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

        const searchFieldValuesMcp = ToolDefinition.toMcpRegistration(
            searchFieldValuesTool,
        );
        this.mcpServer.registerTool(
            searchFieldValuesMcp.name,
            searchFieldValuesMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const projectUuid = await this.resolveProjectUuid(ctx);
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(ctx, searchFieldValuesMcp.name, projectUuid);

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        ctx,
                    );

                const searchFieldValuesAgentTool = getSearchFieldValues({
                    searchFieldValues,
                });
                const result = await searchFieldValuesAgentTool.execute!(
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

        const runSqlMcp = ToolDefinition.toMcpRegistration(runSqlTool);
        this.mcpServer.registerTool(
            runSqlMcp.name,
            runSqlMcp.registration,
            async (args, extra) => {
                const ctx = getMcpContext(extra);

                const { user, account } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(ctx, runSqlMcp.name, projectUuid);

                try {
                    const { jobId } =
                        await this.savedSqlService.getResultJobFromSql(
                            user,
                            projectUuid,
                            args.sql,
                            args.limit ?? 500,
                            QueryExecutionContext.MCP_RUN_SQL,
                        );

                    const jobResult = await this.pollSqlJobToCompletion(
                        account,
                        jobId,
                    );

                    const rows = await this.downloadSqlResults(
                        user,
                        projectUuid,
                        jobResult.fileUrl,
                    );

                    const columns = jobResult.columns.map((c) => c.reference);

                    if (rows.length === 0) {
                        const header =
                            columns.length > 0
                                ? `Columns: ${columns.join(', ')}`
                                : '';
                        return await this.buildScopedResponse(
                            ctx,
                            `Query returned 0 rows.${header ? ` ${header}` : ''}`,
                            { rows: [], columns, rowCount: 0 },
                        );
                    }

                    const csv = stringify(rows, {
                        header: true,
                        columns,
                    });

                    return await this.buildScopedResponse(ctx, csv, {
                        rows,
                        columns,
                        rowCount: rows.length,
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

        const listVerifiedContentMcp = ToolDefinition.toMcpRegistration(
            listVerifiedContentTool,
        );
        this.mcpServer.registerTool(
            listVerifiedContentMcp.name,
            listVerifiedContentMcp.registration,
            async (_args, extra) => {
                const ctx = getMcpContext(extra);

                const { user } = McpService.getAccount(ctx);
                const projectUuid = await this.resolveProjectUuid(ctx);

                this.trackToolCall(
                    ctx,
                    listVerifiedContentMcp.name,
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

        this.mcpServer.registerPrompt(
            'lightdash-analyst',
            {
                title: 'Lightdash Data Analyst',
                description:
                    'Guidelines for querying Lightdash data using MCP tools. Includes explore selection, query building, visualization rules, active agent context (instructions, verified questions, available explores). Inject this into your system prompt for best results.',
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

        this.setupSkillResourceHandlers();
    }

    private setupSkillResourceHandlers(): void {
        BuiltInSkills.listMcpResources().forEach((resource) => {
            this.mcpServer.registerResource(
                resource.name,
                resource.uri,
                {
                    title: resource.title,
                    description: resource.description,
                    mimeType: MCP_SKILL_RESOURCE_MIME_TYPE,
                },
                async () => {
                    const text = resource.resourceName
                        ? await BuiltInSkills.getMcpSkillResourceBody(
                              resource.skillName,
                              resource.resourceName,
                          )
                        : await BuiltInSkills.getMcpSkillBody(
                              resource.skillName,
                          );

                    if (!text) {
                        throw new NotFoundError(
                            `Resource "${resource.uri}" was not found`,
                        );
                    }

                    return {
                        contents: [
                            {
                                uri: resource.uri,
                                mimeType: MCP_SKILL_RESOURCE_MIME_TYPE,
                                text,
                            },
                        ],
                    };
                },
            );
        });
    }

    private async pollSqlJobToCompletion(
        account: Account,
        jobId: string,
    ): Promise<{ fileUrl: string; columns: Array<{ reference: string }> }> {
        let job;
        try {
            job = await this.schedulerService.pollJobToCompletion(
                account,
                jobId,
            );
        } catch (e) {
            if (e instanceof JobPollTimeoutError) {
                throw new Error(
                    `SQL query timed out after ${Math.round(
                        e.timeoutMs / 1000,
                    )}s`,
                );
            }
            throw e;
        }

        if (job.status === SchedulerJobStatus.ERROR) {
            const errorDetail =
                sqlJobErrorDetailsSchema.safeParse(job.details).data?.error ??
                'Unknown error';
            throw new Error(`SQL query failed: ${errorDetail}`);
        }

        const details = sqlJobCompletedDetailsSchema.safeParse(job.details);
        if (!details.success) {
            throw new Error(
                'SQL query completed but no results file was produced',
            );
        }
        return {
            fileUrl: details.data.fileUrl,
            columns: details.data.columns ?? [],
        };
    }

    private async downloadSqlResults(
        user: SessionUser,
        projectUuid: string,
        fileUrl: string,
    ) {
        const fileId = fileUrl.split('/').pop();
        if (!fileId) {
            throw new Error(`Could not extract file ID from URL: ${fileUrl}`);
        }

        const readStream = await this.projectService.getFileStream(
            user,
            projectUuid,
            fileId,
        );

        const { results } = await streamJsonlData<Record<string, unknown>>({
            readStream,
            onRow: (row) => row,
        });

        return results;
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
        runAsyncQuery: RunAsyncQueryFn;
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

        const runAsyncQuery: RunAsyncQueryFn = async (
            metricQuery,
            additionalMetrics,
        ) =>
            this.asyncQueryService.executeMetricQueryAndGetResults({
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    additionalMetrics: additionalMetrics ?? [],
                },
                context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                userAttributeOverrides,
            });

        return { agentContext, runAsyncQuery };
    }

    async getSearchFieldValuesFunction(
        toolArgs: Omit<ToolInput<typeof searchFieldValuesTool>, 'type'> & {
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
    public createServer(options?: { projectPinned?: boolean }): McpServer {
        const newServer = this.createMcpServer();

        // Temporarily swap the server to register handlers on the new instance
        const originalServer = this.mcpServer;
        this.mcpServer = newServer;
        this.setupHandlers({ projectPinned: options?.projectPinned ?? false });
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
            const authType =
                context.authInfo?.extra.account.authentication.type ?? 'none';
            const clientMetadata =
                context.authInfo?.extra.mcpClientMetadata ??
                getMcpClientMetadata({
                    requestInfo: context.requestInfo,
                    _meta: context._meta,
                });
            const mcpClientMetadata = {
                authType,
                ...clientMetadata,
                toolName,
            };

            this.logger.debug(
                `Tracking MCP client authType=${authType} anthropicClient=${
                    mcpClientMetadata.anthropicClient ?? 'none'
                } protocolVersion=${
                    mcpClientMetadata.protocolVersion ?? 'unknown'
                } userAgent=${
                    mcpClientMetadata.userAgent ?? 'unknown'
                } clientSource=${
                    mcpClientMetadata.clientSource ?? 'none'
                } toolName=${toolName}`,
                mcpClientMetadata,
            );

            this.analytics.track<McpToolCallEvent>({
                event: 'mcp_tool_call',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    toolName,
                    authType,
                    anthropicClient: mcpClientMetadata.anthropicClient,
                    clientSource: mcpClientMetadata.clientSource,
                    protocolVersion: mcpClientMetadata.protocolVersion,
                    userAgent: mcpClientMetadata.userAgent,
                },
            });
        } catch (error) {
            this.logger.debug('Failed to track MCP tool call', error);
        }
    }
}
