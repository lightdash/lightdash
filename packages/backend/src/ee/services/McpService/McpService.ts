import {
    Account,
    AnyType,
    ApiKeyAccount,
    CatalogFilter,
    CatalogType,
    CommercialFeatureFlags,
    Explore,
    filterExploreByTags,
    ForbiddenError,
    isExploreError,
    MissingConfigError,
    NotFoundError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    SessionUser,
    ToolFindChartsArgs,
    toolFindChartsArgsSchema,
    ToolFindDashboardsArgs,
    toolFindDashboardsArgsSchema,
    toolFindExploresArgsSchemaV2,
    ToolFindExploresArgsV2,
    ToolFindFieldsArgs,
    toolFindFieldsArgsSchema,
    ToolRunMetricQueryArgs,
    toolRunMetricQueryArgsSchema,
    ToolSearchFieldValuesArgs,
    toolSearchFieldValuesArgsSchema,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
// eslint-disable-next-line import/extensions
import { subject } from '@casl/ability';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
import { SpaceModel } from '../../../models/SpaceModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    getFilteredExplore,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { wrapSentryTransaction } from '../../../utils';
import { VERSION } from '../../../version';
import { getFindCharts } from '../ai/tools/findCharts';
import { getFindDashboards } from '../ai/tools/findDashboards';
import { getFindExplores } from '../ai/tools/findExplores';
import { getFindFields } from '../ai/tools/findFields';
import { getRunMetricQuery } from '../ai/tools/runMetricQuery';
import { getSearchFieldValues } from '../ai/tools/searchFieldValues';
import {
    FindChartsFn,
    FindDashboardsFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    RunMiniMetricQueryFn,
    SearchFieldValuesFn,
} from '../ai/types/aiAgentDependencies';
import { McpSchemaCompatLayer } from './McpSchemaCompatLayer';

export enum McpToolName {
    GET_LIGHTDASH_VERSION = 'get_lightdash_version',
    FIND_EXPLORES = 'find_explores',
    FIND_FIELDS = 'find_fields',
    FIND_DASHBOARDS = 'find_dashboards',
    FIND_CHARTS = 'find_charts',
    LIST_PROJECTS = 'list_projects',
    SET_PROJECT = 'set_project',
    GET_CURRENT_PROJECT = 'get_current_project',
    RUN_METRIC_QUERY = 'run_metric_query',
    SEARCH_FIELD_VALUES = 'search_field_values',
}

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    catalogService: CatalogService;
    projectModel: ProjectModel;
    projectService: ProjectService;
    userAttributesModel: UserAttributesModel;
    searchModel: SearchModel;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    mcpContextModel: McpContextModel;
    featureFlagService: FeatureFlagService;
};

export type ExtraContext = {
    user: SessionUser;
    account: OauthAccount | ApiKeyAccount;
};
type McpProtocolContext = {
    authInfo?: AuthInfo & {
        extra: ExtraContext;
    };
};

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private analytics: LightdashAnalytics;

    private catalogService: CatalogService;

    private projectService: ProjectService;

    private projectModel: ProjectModel;

    private userAttributesModel: UserAttributesModel;

    private searchModel: SearchModel;

    private spaceModel: SpaceModel;

    private spaceService: SpaceService;

    private mcpContextModel: McpContextModel;

    private featureFlagService: FeatureFlagService;

    private mcpServer: McpServer;

    private mcpCompatLayer: McpSchemaCompatLayer;

    constructor({
        lightdashConfig,
        analytics,
        catalogService,
        projectService,
        userAttributesModel,
        searchModel,
        spaceModel,
        spaceService,
        projectModel,
        mcpContextModel,
        featureFlagService,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.catalogService = catalogService;
        this.projectService = projectService;
        this.userAttributesModel = userAttributesModel;
        this.searchModel = searchModel;
        this.spaceModel = spaceModel;
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
            async (_args, context) => {
                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.GET_LIGHTDASH_VERSION,
                );
                return {
                    content: [
                        {
                            type: 'text',
                            text: this.getLightdashVersion(
                                context as McpProtocolContext,
                            ),
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_EXPLORES,
            {
                description: toolFindExploresArgsSchemaV2.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindExploresArgsSchemaV2,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolFindExploresArgsV2;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.FIND_EXPLORES,
                    projectUuid,
                );

                const findExplores: FindExploresFn =
                    await this.getFindExploresFunction(
                        argsWithProject,
                        context as McpProtocolContext,
                    );

                const findExploresTool = getFindExplores({
                    findExplores,
                    updateProgress: async () => {}, // No-op for MCP context
                    fieldSearchSize: 200,
                });
                const result = await findExploresTool.execute!(
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

        this.mcpServer.registerTool(
            McpToolName.FIND_FIELDS,
            {
                description: toolFindFieldsArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindFieldsArgsSchema,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolFindFieldsArgs;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.FIND_FIELDS,
                    projectUuid,
                );

                const findFields: FindFieldFn =
                    await this.getFindFieldsFunction(
                        argsWithProject,
                        context as McpProtocolContext,
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
            McpToolName.FIND_DASHBOARDS,
            {
                description: toolFindDashboardsArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindDashboardsArgsSchema,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolFindDashboardsArgs;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.FIND_DASHBOARDS,
                    projectUuid,
                );

                const findDashboards: FindDashboardsFn =
                    await this.getFindDashboardsFunction(
                        argsWithProject,
                        context as McpProtocolContext,
                    );

                const findDashboardsTool = getFindDashboards({
                    findDashboards,
                    pageSize: 10,
                    siteUrl: this.lightdashConfig.siteUrl,
                });
                const result = await findDashboardsTool.execute!(
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

        this.mcpServer.registerTool(
            McpToolName.FIND_CHARTS,
            {
                description: toolFindChartsArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolFindChartsArgsSchema,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolFindChartsArgs;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.FIND_CHARTS,
                    projectUuid,
                );

                const findCharts: FindChartsFn =
                    await this.getFindChartsFunction(
                        argsWithProject,
                        context as McpProtocolContext,
                    );

                const findChartsTool = getFindCharts({
                    findCharts,
                    pageSize: 10,
                    siteUrl: this.lightdashConfig.siteUrl,
                });
                const result = await findChartsTool.execute!(argsWithProject, {
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
            async (_args, context) => {
                const { user, organizationUuid, account } = this.getAccount(
                    context as McpProtocolContext,
                );

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.LIST_PROJECTS,
                );

                const projects =
                    await this.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
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
                    projectUuid: z.string() as AnyType,
                    tags: z.array(z.string()).optional() as AnyType,
                },
            },
            async (_args, context) => {
                const args = _args as { projectUuid: string; tags?: string[] };
                const { user, organizationUuid, account } = this.getAccount(
                    context as McpProtocolContext,
                );

                this.trackToolCall(
                    context as McpProtocolContext,
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
            async (_args, context) => {
                const { user, organizationUuid } = this.getAccount(
                    context as McpProtocolContext,
                );

                this.trackToolCall(
                    context as McpProtocolContext,
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

        this.mcpServer.registerTool(
            McpToolName.RUN_METRIC_QUERY,
            {
                description: toolRunMetricQueryArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolRunMetricQueryArgsSchema,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolRunMetricQueryArgs;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.RUN_METRIC_QUERY,
                    projectUuid,
                );

                const { getExplore, runMiniMetricQuery } =
                    await this.getRunMetricQueryDependencies(
                        argsWithProject,
                        context as McpProtocolContext,
                    );

                const runMetricQueryTool = getRunMetricQuery({
                    getExplore,
                    runMiniMetricQuery,
                    maxLimit: this.lightdashConfig.ai.copilot.maxQueryLimit,
                });

                const result = await runMetricQueryTool.execute!(
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

        this.mcpServer.registerTool(
            McpToolName.SEARCH_FIELD_VALUES,
            {
                description: toolSearchFieldValuesArgsSchema.description,
                inputSchema: this.getMcpCompatibleSchema(
                    toolSearchFieldValuesArgsSchema,
                ) as AnyType,
            },
            async (_args, context) => {
                const args = _args as ToolSearchFieldValuesArgs;

                const projectUuid = await this.resolveProjectUuid(
                    context as McpProtocolContext,
                );
                const argsWithProject = { ...args, projectUuid };

                this.trackToolCall(
                    context as McpProtocolContext,
                    McpToolName.SEARCH_FIELD_VALUES,
                    projectUuid,
                );

                const searchFieldValues: SearchFieldValuesFn =
                    await this.getSearchFieldValuesFunction(
                        argsWithProject,
                        context as McpProtocolContext,
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

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        { organizationUuid, userUuid: user.userUuid },
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
    ) {
        const explores = await this.getAvailableExplores(
            user,
            projectUuid,
            availableTags,
        );

        const explore = explores.find((e) => e.name === exploreName);

        if (!explore) {
            throw new NotFoundError('Explore not found');
        }

        return explore;
    }

    async getFindExploresFunction(
        toolArgs: ToolFindExploresArgsV2 & { projectUuid: string },
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

        const findExplores: FindExploresFn = (args) =>
            wrapSentryTransaction('McpService.findExplores', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    tagsFromContext,
                    args.exploreName,
                );

                const sharedArgs = {
                    projectUuid,
                    catalogSearch: {
                        type: CatalogType.Field,
                        yamlTags: tagsFromContext || undefined,
                        tables: [args.exploreName],
                    },
                    userAttributes,
                    context: CatalogSearchContext.MCP,
                    paginateArgs: {
                        page: 1,
                        pageSize: args.fieldSearchSize,
                    },
                    sortArgs: {
                        sort: 'chartUsage',
                        order: 'desc' as const,
                    },
                };

                const { data: dimensions } =
                    await this.catalogService.searchCatalog({
                        ...sharedArgs,
                        catalogSearch: {
                            ...sharedArgs.catalogSearch,
                            filter: CatalogFilter.Dimensions,
                        },
                    });

                const { data: metrics } =
                    await this.catalogService.searchCatalog({
                        ...sharedArgs,
                        catalogSearch: {
                            ...sharedArgs.catalogSearch,
                            filter: CatalogFilter.Metrics,
                        },
                    });

                return {
                    explore,
                    catalogFields: {
                        dimensions: dimensions.filter(
                            (d) => d.type === CatalogType.Field,
                        ),
                        metrics: metrics.filter(
                            (m) => m.type === CatalogType.Field,
                        ),
                    },
                };
            });

        return findExplores;
    }

    async getFindFieldsFunction(
        toolArgs: ToolFindFieldsArgs & { projectUuid: string },
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

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('McpService.findFields', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const explore = await this.getExplore(
                    user,
                    projectUuid,
                    tagsFromContext,
                    args.table,
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
                        filteredExplore: explore,
                    });

                const catalogFields = catalogItems.filter(
                    (item) => item.type === CatalogType.Field,
                );

                return { fields: catalogFields, pagination };
            });

        return findFields;
    }

    async getFindDashboardsFunction(
        toolArgs: ToolFindDashboardsArgs & { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<FindDashboardsFn> {
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

        const findDashboards: FindDashboardsFn = (args) =>
            wrapSentryTransaction(
                'McpService.findDashboards',
                args,
                async () => {
                    const searchResults =
                        await this.searchModel.searchDashboards(
                            projectUuid,
                            args.dashboardSearchQuery.label,
                        );

                    const filteredDashboards =
                        await this.spaceService.filterBySpaceAccess(
                            user,
                            searchResults,
                        );

                    const totalResults = filteredDashboards.length;
                    const totalPageCount = Math.ceil(
                        totalResults / args.pageSize,
                    );

                    return {
                        dashboards: filteredDashboards,
                        pagination: {
                            page: args.page,
                            pageSize: args.pageSize,
                            totalResults,
                            totalPageCount,
                        },
                    };
                },
            );

        return findDashboards;
    }

    async getFindChartsFunction(
        toolArgs: ToolFindChartsArgs & { projectUuid: string },
        context: McpProtocolContext,
    ): Promise<FindChartsFn> {
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

        const findCharts: FindChartsFn = (args) =>
            wrapSentryTransaction('McpService.findCharts', args, async () => {
                const searchResults = await this.searchModel.searchAllCharts(
                    projectUuid,
                    args.chartSearchQuery.label,
                );

                const filteredCharts =
                    await this.spaceService.filterBySpaceAccess(
                        user,
                        searchResults,
                    );

                const totalResults = filteredCharts.length;
                const totalPageCount = Math.ceil(totalResults / args.pageSize);

                return {
                    charts: filteredCharts,
                    pagination: {
                        page: args.page,
                        pageSize: args.pageSize,
                        totalResults,
                        totalPageCount,
                    },
                };
            });

        return findCharts;
    }

    async getRunMetricQueryDependencies(
        toolArgs: ToolRunMetricQueryArgs & {
            projectUuid: string;
        },
        context: McpProtocolContext,
    ): Promise<{
        getExplore: GetExploreFn;
        runMiniMetricQuery: RunMiniMetricQueryFn;
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

        const getExplore: GetExploreFn = async ({ exploreName }) => {
            const explore = await this.projectService.getExplore(
                account,
                projectUuid,
                exploreName,
            );
            return explore;
        };

        const runMiniMetricQuery: RunMiniMetricQueryFn = async (
            metricQuery,
            maxLimit,
            additionalMetrics,
        ) =>
            this.projectService.runMetricQuery({
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    additionalMetrics: additionalMetrics ?? [],
                },
                exploreName: metricQuery.exploreName,
                csvLimit: maxLimit,
                context: QueryExecutionContext.MCP,
                chartUuid: undefined,
                queryTags: {
                    project_uuid: projectUuid,
                    user_uuid: user.userUuid,
                    organization_uuid: organizationUuid,
                },
            });

        return { getExplore, runMiniMetricQuery };
    }

    async getSearchFieldValuesFunction(
        toolArgs: ToolSearchFieldValuesArgs & { projectUuid: string },
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
                        );
                    return results;
                },
            );

        return searchFieldValues;
    }

    public getServer(): McpServer {
        return this.mcpServer;
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
