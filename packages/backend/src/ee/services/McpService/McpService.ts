import {
    Account,
    AnyType,
    CatalogFilter,
    CatalogType,
    ForbiddenError,
    MissingConfigError,
    OauthAccount,
    ParameterError,
    QueryExecutionContext,
    SessionUser,
    ToolFindChartsArgs,
    toolFindChartsArgsSchema,
    ToolFindDashboardsArgs,
    toolFindDashboardsArgsSchema,
    ToolFindExploresArgs,
    toolFindExploresArgsSchema,
    ToolFindFieldsArgs,
    toolFindFieldsArgsSchema,
    ToolRunMetricQueryArgs,
    toolRunMetricQueryArgsSchema,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { subject } from '@casl/ability';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    LightdashAnalytics,
    McpToolCallEvent,
} from '../../../analytics/LightdashAnalytics';
import { fromSession } from '../../../auth/account';
import { LightdashConfig } from '../../../config/parseConfig';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import {
    McpContextModel,
    McpContext as ProjectContext,
} from '../../../models/McpContextModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../../models/SearchModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { OAuthScope } from '../../../services/OAuthService/OAuthService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import { wrapSentryTransaction } from '../../../utils';
import { VERSION } from '../../../version';
import { getFindCharts } from '../ai/tools/findCharts';
import { getFindDashboards } from '../ai/tools/findDashboards';
import { getFindExplores } from '../ai/tools/findExplores';
import { getFindFields } from '../ai/tools/findFields';
import { getRunMetricQuery } from '../ai/tools/runMetricQuery';
import {
    FindChartsFn,
    FindDashboardsFn,
    FindExploresFn,
    FindFieldFn,
    GetExploreFn,
    RunMiniMetricQueryFn,
} from '../ai/types/aiAgentDependencies';

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
};

export type ExtraContext = { user: SessionUser; account: OauthAccount };
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

    private mcpServer: McpServer;

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
        try {
            this.mcpServer = new McpServer({
                name: 'Lightdash MCP Server',
                version: VERSION,
            });
            this.setupHandlers();
        } catch (error) {
            this.logger.error('Error initializing MCP server:', error);
            throw error;
        }
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
                description: toolFindExploresArgsSchema.description,
                inputSchema: toolFindExploresArgsSchema.shape as AnyType, // Cast to AnyType to avoid slow TypeScript compilation
            },
            async (_args, context) => {
                const args = _args as ToolFindExploresArgs;

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
                    pageSize: 15,
                    maxDescriptionLength: 100,
                    fieldSearchSize: 200,
                    fieldOverviewSearchSize: 5,
                });
                const result = await findExploresTool.execute(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_FIELDS,
            {
                description: toolFindFieldsArgsSchema.description,
                inputSchema: toolFindFieldsArgsSchema.shape as AnyType, // Cast to AnyType to avoid slow TypeScript compilation
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
                    pageSize: 15,
                });
                const result = await findFieldsTool.execute(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_DASHBOARDS,
            {
                description: toolFindDashboardsArgsSchema.description,
                inputSchema: toolFindDashboardsArgsSchema.shape as AnyType, // Cast to AnyType to avoid slow TypeScript compilation
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
                const result = await findDashboardsTool.execute(
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
                            text: result,
                        },
                    ],
                };
            },
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_CHARTS,
            {
                description: toolFindChartsArgsSchema.description,
                inputSchema: toolFindChartsArgsSchema.shape as AnyType, // Cast to AnyType to avoid slow TypeScript compilation
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
                const result = await findChartsTool.execute(argsWithProject, {
                    toolCallId: '',
                    messages: [],
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: result,
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
                },
            },
            async (_args, context) => {
                const args = _args as { projectUuid: string };
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

                // Set context
                await this.mcpContextModel.setContext({
                    userUuid: user.userUuid,
                    organizationUuid,
                    context: {
                        projectUuid: args.projectUuid,
                        projectName: project.name,
                    },
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    projectUuid: args.projectUuid,
                                    projectName: project.name,
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

                const { projectUuid, projectName } = contextRow.context;
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                { projectUuid, projectName },
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
                inputSchema: toolRunMetricQueryArgsSchema.shape as AnyType, // Cast to AnyType to avoid slow TypeScript compilation
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

                const result = await runMetricQueryTool.execute(
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
                            text: result,
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

    async getFindExploresFunction(
        toolArgs: ToolFindExploresArgs & { projectUuid: string },
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

        const findExplores: FindExploresFn = (args) =>
            wrapSentryTransaction('McpService.findExplores', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const { data: tables, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Table,
                            yamlTags: undefined,
                            tables: args.tableName
                                ? [args.tableName]
                                : undefined,
                        },
                        userAttributes,
                        context: CatalogSearchContext.MCP,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                    });

                const tablesWithFields = await Promise.all(
                    tables
                        .filter((table) => table.type === CatalogType.Table)
                        .map(async (table) => {
                            if (!args.includeFields) {
                                return {
                                    table,
                                    dimensions: [],
                                    metrics: [],
                                    dimensionsPagination: undefined,
                                    metricsPagination: undefined,
                                };
                            }

                            if (
                                !args.fieldSearchSize ||
                                !args.fieldOverviewSearchSize
                            ) {
                                throw new Error(
                                    'fieldSearchSize and fieldOverviewSearchSize are required when includeFields is true',
                                );
                            }

                            const sharedArgs = {
                                projectUuid,
                                catalogSearch: {
                                    type: CatalogType.Field,
                                    yamlTags: undefined,
                                    tables: [table.name],
                                },
                                userAttributes,
                                context: CatalogSearchContext.MCP,
                                paginateArgs: {
                                    page: 1,
                                    pageSize: args.tableName
                                        ? args.fieldSearchSize
                                        : args.fieldOverviewSearchSize,
                                },
                                sortArgs: {
                                    sort: 'chartUsage',
                                    order: 'desc' as const,
                                },
                            };

                            const {
                                data: dimensions,
                                pagination: dimensionsPagination,
                            } = await this.catalogService.searchCatalog({
                                ...sharedArgs,
                                catalogSearch: {
                                    ...sharedArgs.catalogSearch,
                                    filter: CatalogFilter.Dimensions,
                                },
                            });

                            const {
                                data: metrics,
                                pagination: metricsPagination,
                            } = await this.catalogService.searchCatalog({
                                ...sharedArgs,
                                catalogSearch: {
                                    ...sharedArgs.catalogSearch,
                                    filter: CatalogFilter.Metrics,
                                },
                            });

                            return {
                                table,
                                dimensions: dimensions.filter(
                                    (d) => d.type === CatalogType.Field,
                                ),
                                metrics: metrics.filter(
                                    (m) => m.type === CatalogType.Field,
                                ),
                                dimensionsPagination,
                                metricsPagination,
                            };
                        }),
                );

                return {
                    tablesWithFields,
                    pagination,
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

        const findFields: FindFieldFn = (args) =>
            wrapSentryTransaction('McpService.findFields', args, async () => {
                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                const { data: catalogItems, pagination } =
                    await this.catalogService.searchCatalog({
                        projectUuid,
                        catalogSearch: {
                            type: CatalogType.Field,
                            searchQuery: args.fieldSearchQuery.label,
                            yamlTags: undefined,
                            tables: args.table ? [args.table] : undefined,
                        },
                        context: CatalogSearchContext.MCP,
                        paginateArgs: {
                            page: args.page,
                            pageSize: args.pageSize,
                        },
                        userAttributes,
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
        ) =>
            this.projectService.runMetricQuery({
                account,
                projectUuid,
                metricQuery: {
                    ...metricQuery,
                    tableCalculations: [],
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
        const { scopes } = account.authentication;

        // TODO replace with CASL ability check
        // Do not enforce client scopes for now until more MCP clients support this
        /*
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
