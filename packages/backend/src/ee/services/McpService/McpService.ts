/* eslint-disable import/extensions */
import { subject } from '@casl/ability';
import {
    Account,
    AiResultType,
    AnyType,
    ApiKeyAccount,
    CatalogType,
    CommercialFeatureFlags,
    convertAiTableCalcsSchemaToTableCalcs,
    Explore,
    filterExploreByTags,
    ForbiddenError,
    getItemLabelWithoutTableName,
    getSlackAiEchartsConfig,
    getValidAiQueryLimit,
    isExploreError,
    mcpToolListExploresArgsSchema,
    MissingConfigError,
    NotFoundError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    ServiceAcctAccount,
    SessionUser,
    ToolFindContentArgs,
    toolFindContentArgsSchema,
    toolFindExploresArgsSchemaV3,
    ToolFindExploresArgsV3,
    ToolFindFieldsArgs,
    toolFindFieldsArgsSchema,
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
    ToolSearchFieldValuesArgs,
    toolSearchFieldValuesArgsSchema,
    UserAttributeValueMap,
} from '@lightdash/common';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
    ServerNotification,
    ServerRequest,
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
import { NO_RESULTS_RETRY_PROMPT } from '../ai/prompts/noResultsRetry';
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
    RunAsyncQueryFn,
    SearchFieldValuesFn,
} from '../ai/types/aiAgentDependencies';
import { AgentContext } from '../ai/utils/AgentContext';
import { getPivotedResults } from '../ai/utils/getPivotedResults';
import { populateCustomMetricsSQL } from '../ai/utils/populateCustomMetricsSQL';
import { serializeData } from '../ai/utils/serializeData';
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
    LIST_PROJECTS = 'list_projects',
    SET_PROJECT = 'set_project',
    GET_CURRENT_PROJECT = 'get_current_project',
    RUN_METRIC_QUERY = 'run_metric_query',
    SEARCH_FIELD_VALUES = 'search_field_values',
}

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    asyncQueryService: AsyncQueryService;
    catalogService: CatalogService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    shareService: ShareService;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    spaceService: SpaceService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
};

export type ExtraContext = {
    user: SessionUser;
    account: OauthAccount | ApiKeyAccount | ServiceAcctAccount;
    /** User attribute overrides passed via X-Lightdash-User-Attributes header */
    headerUserAttributes?: UserAttributeValueMap;
};
type McpProtocolContext = {
    authInfo?: AuthInfo & {
        extra: ExtraContext;
    };
};

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private analytics: LightdashAnalytics;

    private asyncQueryService: AsyncQueryService;

    private catalogService: CatalogService;

    private projectService: ProjectService;

    private projectModel: ProjectModel;

    private userAttributesModel: UserAttributesModel;

    private searchModel: SearchModel;

    private spaceService: SpaceService;

    private mcpContextModel: McpContextModel;

    private shareService: ShareService;

    private featureFlagService: FeatureFlagService;

    private mcpServer: McpServer;

    private mcpCompatLayer: McpSchemaCompatLayer;

    constructor({
        lightdashConfig,
        analytics,
        asyncQueryService,
        catalogService,
        projectService,
        shareService,
        userAttributesModel,
        searchModel,
        spaceService,
        projectModel,
        mcpContextModel,
        featureFlagService,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.asyncQueryService = asyncQueryService;
        this.catalogService = catalogService;
        this.projectService = projectService;
        this.shareService = shareService;
        this.userAttributesModel = userAttributesModel;
        this.searchModel = searchModel;
        this.projectModel = projectModel;
        this.spaceService = spaceService;
        this.mcpContextModel = mcpContextModel;
        this.featureFlagService = featureFlagService;
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

    static async streamToolResult(
        result:
            | { result: string }
            | AsyncIterable<{
                  result: string;
              }>,
    ): Promise<string> {
        if (
            'result' in result &&
            typeof result.result === 'string' &&
            Symbol.asyncIterator in result === false
        ) {
            return result.result;
        }

        let out = '';
        for await (const chunk of result as AsyncIterable<{
            result: string;
            metadata: { status: 'error' | 'success' };
        }>) {
            out += chunk.result;
        }
        return out;
    }

    private getMcpCompatibleSchema(schema: z.ZodSchema<unknown>): ZodRawShape {
        return this.mcpCompatLayer.processZodType(schema).shape;
    }

    setupHandlers(): void {
        this.mcpServer.registerTool(
            McpToolName.GET_LIGHTDASH_VERSION,
            {
                description: 'Get the current Lightdash version',
                inputSchema: {},
            },
            async (
                _args: Record<string, never>,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.GET_LIGHTDASH_VERSION,
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: this.getLightdashVersion(
                                extra as McpProtocolContext,
                            ),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.LIST_EXPLORES,
            {
                description: mcpToolListExploresArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    mcpToolListExploresArgsSchema,
                ),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                try {
                    const { user } = this.getAccount(
                        extra as McpProtocolContext,
                    );

                    const projectUuid = await this.resolveProjectUuid(
                        extra as McpProtocolContext,
                    );

                    this.trackToolCall(
                        extra as McpProtocolContext,
                        McpToolName.LIST_EXPLORES,
                        projectUuid,
                    );

                    const tagsFromContext = await this.getTagsFromContext(
                        extra as McpProtocolContext,
                    );

                    const userAttributeOverrides =
                        await this.getUserAttributeOverridesFromContext(
                            extra as McpProtocolContext,
                        );

                    const listExplores = async () =>
                        this.getAvailableExplores(
                            user,
                            projectUuid,
                            tagsFromContext,
                            userAttributeOverrides,
                        );

                    const mcpListExploresTool = getMcpListExplores({
                        listExplores,
                    });

                    const result = await mcpListExploresTool.execute!(
                        {},
                        {
                            toolCallId: '',
                            messages: [],
                        },
                    );

                    return {
                        content: [
                            {
                                type: 'text',
                                text: await McpService.streamToolResult(result),
                            },
                        ],
                    };
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
            McpToolName.FIND_EXPLORES,
            {
                description: toolFindExploresArgsSchemaV3.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindExploresArgsSchemaV3,
                ),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const args = _args as Omit<ToolFindExploresArgsV3, 'type'>;

                const projectUuid = await this.resolveProjectUuid(
                    extra as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.FIND_EXPLORES,
                    projectUuid,
                );

                const findExplores: FindExploresFn =
                    await this.getFindExploresFunction(
                        argsWithProject,
                        extra as McpProtocolContext,
                    );

                const { user } = (extra as McpProtocolContext).authInfo!.extra;
                const tagsFromContext = await this.getTagsFromContext(
                    extra as McpProtocolContext,
                );
                const userAttributeOverrides =
                    await this.getUserAttributeOverridesFromContext(
                        extra as McpProtocolContext,
                    );
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

                return {
                    content: [
                        {
                            type: 'text',
                            text: await McpService.streamToolResult(result),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_FIELDS,
            {
                description: toolFindFieldsArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindFieldsArgsSchema,
                ),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const args = _args as Omit<ToolFindFieldsArgs, 'type'>;

                const projectUuid = await this.resolveProjectUuid(
                    extra as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.FIND_FIELDS,
                    projectUuid,
                );

                const findFields: FindFieldFn =
                    await this.getFindFieldsFunction(
                        argsWithProject,
                        extra as McpProtocolContext,
                    );

                const findFieldsTool = getFindFields({
                    findFields,
                    updateProgress: async () => {}, // No-op for MCP context
                    pageSize: 15,
                });
                const result = await findFieldsTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: await McpService.streamToolResult(result),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_CONTENT,
            {
                description: toolFindContentArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindContentArgsSchema,
                ),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const args = _args as Omit<ToolFindContentArgs, 'type'>;

                const projectUuid = await this.resolveProjectUuid(
                    extra as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.FIND_CONTENT,
                    projectUuid,
                );

                const findContent: FindContentFn =
                    await this.getFindContentFunction(
                        argsWithProject,
                        extra as McpProtocolContext,
                    );

                const findContentTool = getFindContent({
                    findContent,
                    siteUrl: this.lightdashConfig.siteUrl,
                });
                const result = await findContentTool.execute!(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: await McpService.streamToolResult(result),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.LIST_PROJECTS,
            {
                description: 'List all accessible projects in the organization',
                inputSchema: {},
            },
            async (
                _args: Record<string, never>,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const { user, organizationUuid } = this.getAccount(
                    extra as McpProtocolContext,
                );

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.LIST_PROJECTS,
                );

                const projects = await wrapSentryTransaction(
                    'McpService.listProjects.getAllByOrganizationUuid',
                    { organizationUuid },
                    async () =>
                        this.projectModel.getAllByOrganizationUuid(
                            organizationUuid,
                        ),
                );

                const projectList = projects.map((project) => ({
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
            McpToolName.SET_PROJECT,
            {
                description:
                    'Set the active project for subsequent MCP operations',
                inputSchema: {
                    projectUuid: z.string(),
                    tags: z.array(z.string()).optional(),
                },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const args = _args as { projectUuid: string; tags?: string[] };
                const { user, organizationUuid, account } = this.getAccount(
                    extra as McpProtocolContext,
                );

                this.trackToolCall(
                    extra as McpProtocolContext,
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

                if (
                    user.ability.cannot(
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

                // Get existing context to preserve user attribute overrides
                const existingContext = await this.mcpContextModel.getContext(
                    user.userUuid,
                    organizationUuid,
                );

                // Set context
                await this.mcpContextModel.setContext({
                    userUuid: user.userUuid,
                    organizationUuid,
                    context: {
                        projectUuid: args.projectUuid,
                        projectName: project.name,
                        tags: tagsToSet,
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

        this.mcpServer.registerTool(
            McpToolName.GET_CURRENT_PROJECT,
            {
                description: 'Get the currently active project',
                inputSchema: {},
            },
            async (
                _args: Record<string, never>,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const { user, organizationUuid } = this.getAccount(
                    extra as McpProtocolContext,
                );

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.GET_CURRENT_PROJECT,
                );

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
            McpToolName.RUN_METRIC_QUERY,
            {
                description: toolRunQueryArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolRunQueryArgsSchema,
                ),
                _meta: { ui: { resourceUri: chartResourceUri } },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const projectUuid = await this.resolveProjectUuid(
                    extra as McpProtocolContext,
                );
                const argsWithProject = { ..._args, projectUuid };

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.RUN_METRIC_QUERY,
                    projectUuid,
                );

                try {
                    const { agentContext, runAsyncQuery } =
                        await this.getRunMetricQueryDependencies(
                            { projectUuid },
                            extra as McpProtocolContext,
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
                    const query = {
                        exploreName: queryTool.queryConfig.exploreName,
                        dimensions: queryTool.queryConfig.dimensions,
                        metrics: queryTool.queryConfig.metrics,
                        sorts: queryTool.queryConfig.sorts.map((sort) => ({
                            ...sort,
                            nullsFirst: sort.nullsFirst ?? undefined,
                        })),
                        limit: getValidAiQueryLimit(
                            queryTool.queryConfig.limit,
                            maxLimit,
                        ),
                        filters: queryTool.filters,
                        additionalMetrics: queryTool.customMetrics ?? [],
                        tableCalculations:
                            convertAiTableCalcsSchemaToTableCalcs(
                                queryTool.tableCalculations,
                            ),
                    };

                    // Populate SQL for custom metrics
                    const populatedAdditionalMetrics = populateCustomMetricsSQL(
                        queryTool.customMetrics,
                        explore,
                    );

                    const results = await runAsyncQuery(
                        query,
                        populatedAdditionalMetrics,
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
                            metrics: queryTool.queryConfig.metrics,
                            sorts: queryTool.queryConfig.sorts,
                            limit: query.limit,
                            filters: queryTool.filters ?? {},
                            additionalMetrics: populatedAdditionalMetrics,
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

                    const { user: mcpUser } = (extra as McpProtocolContext)
                        .authInfo!.extra;
                    const shareUrl = await this.shareService.createShareUrl(
                        mcpUser,
                        explorePath,
                        exploreParams,
                    );
                    const exploreUrl = `${this.lightdashConfig.siteUrl}/share/${shareUrl.nanoid}`;

                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: serializeData(csv, 'csv'),
                            },
                        ],
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

        this.mcpServer.registerTool(
            McpToolName.SEARCH_FIELD_VALUES,
            {
                description: toolSearchFieldValuesArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolSearchFieldValuesArgsSchema,
                ),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (
                _args: AnyType,
                extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
            ) => {
                const args = _args as Omit<ToolSearchFieldValuesArgs, 'type'>;

                const projectUuid = await this.resolveProjectUuid(
                    extra as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    extra as McpProtocolContext,
                    McpToolName.SEARCH_FIELD_VALUES,
                    projectUuid,
                );

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        extra as McpProtocolContext,
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

                return {
                    content: [
                        {
                            type: 'text',
                            text: await McpService.streamToolResult(result),
                        },
                    ],
                };
            },
        );
    }

    async getProjectUuidFromContext(
        context: McpProtocolContext,
    ): Promise<string | undefined> {
        const { user } = context.authInfo!.extra;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return undefined;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            organizationUuid,
        );

        return contextRow?.context.projectUuid;
    }

    async getTagsFromContext(
        context: McpProtocolContext,
    ): Promise<string[] | null> {
        const { user } = context.authInfo!.extra;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return null;
        }

        const contextRow = await this.mcpContextModel.getContext(
            user.userUuid,
            organizationUuid,
        );

        return contextRow?.context.tags || null;
    }

    async getMergedUserAttributes(
        context: McpProtocolContext,
    ): Promise<UserAttributeValueMap> {
        const { user, headerUserAttributes } = context.authInfo!.extra;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return {};
        }

        // Get database defaults
        const dbAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        // Validate header attributes if present (admin + narrowing check)
        if (headerUserAttributes) {
            validateUserAttributeOverrides(
                user,
                headerUserAttributes,
                dbAttributes,
            );
        }

        return mergeUserAttributes(dbAttributes, headerUserAttributes);
    }

    async getUserAttributeOverridesFromContext(
        context: McpProtocolContext,
    ): Promise<UserAttributeValueMap | undefined> {
        const { user, headerUserAttributes } = context.authInfo!.extra;
        const { organizationUuid } = user;

        if (!user || !organizationUuid) {
            return undefined;
        }

        if (!headerUserAttributes) {
            return undefined;
        }

        // Validate header attributes (admin + narrowing check)
        const dbAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });
        validateUserAttributeOverrides(
            user,
            headerUserAttributes,
            dbAttributes,
        );

        return headerUserAttributes;
    }

    async resolveProjectUuid(context: McpProtocolContext): Promise<string> {
        // Use projectUuid from args or get from context
        const projectUuid = await this.getProjectUuidFromContext(context);
        if (!projectUuid) {
            throw new ForbiddenError(
                'No project context set. Use set_project or provide projectUuid parameter.',
            );
        }
        return projectUuid;
    }

    async getAvailableExplores(
        user: SessionUser,
        projectUuid: string,
        availableTags: string[] | null,
        userAttributeOverrides?: UserAttributeValueMap,
    ) {
        return wrapSentryTransaction(
            'AiAgent.getAvailableExplores',
            {
                projectUuid,
                availableTags,
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
        const explores = await this.getAvailableExplores(
            user,
            projectUuid,
            availableTags,
            userAttributeOverrides,
        );

        const explore = explores.find((e) => e.name === exploreName);

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
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
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
    ): Promise<FindFieldFn> {
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
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

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('McpService.findFields', args, async () => {
                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    tagsFromContext,
                    args.table,
                    userAttributeOverrides,
                );

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
                        filteredExplores: [explore],
                    });

                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );

                return { fields: catalogFields, pagination };
            });

        return findFields;
    }

    async getFindContentFunction(
        toolArgs: Omit<ToolFindContentArgs, 'type'> & { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<FindContentFn> {
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
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
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
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
                context: QueryExecutionContext.MCP,
            });

        return { agentContext, runAsyncQuery };
    }

    async getSearchFieldValuesFunction(
        toolArgs: Omit<ToolSearchFieldValuesArgs, 'type'> & {
            projectUuid: string;
        },
        context: McpProtocolContext,
    ): Promise<SearchFieldValuesFn> {
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;
        const { projectUuid } = toolArgs;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }

        const project = await this.projectService.getProject(
            projectUuid,
            account,
        );

        if (
            user.ability.cannot(
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
    public createServer(): McpServer {
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
        this.setupHandlers();
        this.mcpServer = originalServer;

        return newServer;
    }

    // eslint-disable-next-line class-methods-use-this
    public getAccount(context: McpProtocolContext): {
        user: SessionUser;
        organizationUuid: string;
        account: Account;
    } {
        const { user, account } = context.authInfo!.extra;
        const { organizationUuid } = user;

        if (!user || !organizationUuid || !account) {
            throw new ForbiddenError();
        }
        return { user, organizationUuid, account };
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

    // MCP is enabled if MCP_ENABLED is true OR if AI Copilot is enabled
    public async isEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        if (this.lightdashConfig.mcp.enabled) {
            return true;
        }

        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
    }

    public getLightdashVersion(context: McpProtocolContext): string {
        this.canAccessMcp(context);
        return VERSION;
    }

    private trackToolCall(
        context: McpProtocolContext,
        toolName: string,
        projectUuid?: string,
    ): void {
        try {
            const { user, organizationUuid } = this.getAccount(context);
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
