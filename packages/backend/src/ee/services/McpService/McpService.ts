import {
    AnyType,
    CatalogFilter,
    CatalogType,
    ForbiddenError,
    MissingConfigError,
    OauthAccount,
    SessionUser,
    ToolFindExploresArgs,
    ToolFindFieldsArgs,
    toolFindExploresArgsSchema,
    toolFindFieldsArgsSchema,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { subject } from '@casl/ability';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LightdashConfig } from '../../../config/parseConfig';
import { CatalogSearchContext } from '../../../models/CatalogModel/CatalogModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { BaseService } from '../../../services/BaseService';
import { CatalogService } from '../../../services/CatalogService/CatalogService';
import { OAuthScope } from '../../../services/OAuthService/OAuthService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { wrapSentryTransaction } from '../../../utils';
import { VERSION } from '../../../version';
import {
    getFindExplores,
    toolFindExploresDescription,
} from '../ai/tools/findExplores';
import {
    getFindFields,
    toolFindFieldsDescription,
} from '../ai/tools/findFields';
import { FindExploresFn, FindFieldFn } from '../ai/types/aiAgentDependencies';

export enum McpToolName {
    GET_LIGHTDASH_VERSION = 'get_lightdash_version',
    FIND_EXPLORES = 'find_explores',
    FIND_FIELDS = 'find_fields',
}

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
    catalogService: CatalogService;
    projectService: ProjectService;
    userAttributesModel: UserAttributesModel;
};

export type ExtraContext = { user: SessionUser; account: OauthAccount };
type McpContext = {
    authInfo?: AuthInfo & {
        extra: ExtraContext;
    };
};

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private catalogService: CatalogService;

    private projectService: ProjectService;

    private userAttributesModel: UserAttributesModel;

    private mcpServer: McpServer;

    constructor({
        lightdashConfig,
        catalogService,
        projectService,
        userAttributesModel,
    }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.catalogService = catalogService;
        this.projectService = projectService;
        this.userAttributesModel = userAttributesModel;
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
            async (_args, context) => ({
                content: [
                    {
                        type: 'text',
                        text: this.getLightdashVersion(context as McpContext),
                    },
                ],
            }),
        );

        this.mcpServer.registerTool(
            McpToolName.FIND_EXPLORES,
            {
                description: toolFindExploresDescription,
                inputSchema: {
                    // Cast to AnyType to avoid slow TypeScript compilation
                    ...(toolFindExploresArgsSchema.shape as AnyType),
                    projectUuid: z.string(),
                },
            },
            async (_args, context) => {
                const args = _args as ToolFindExploresArgs & {
                    projectUuid: string;
                };

                const findExplores: FindExploresFn =
                    await this.getFindExploresFunction(
                        args,
                        context as McpContext,
                    );

                const findExploresTool = getFindExplores({
                    findExplores,
                    pageSize: 15,
                    maxDescriptionLength: 100,
                    fieldSearchSize: 200,
                    fieldOverviewSearchSize: 5,
                });
                const result = await findExploresTool.execute(args, {
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
                description: toolFindFieldsDescription,
                inputSchema: {
                    // Cast to AnyType to avoid slow TypeScript compilation
                    ...(toolFindFieldsArgsSchema.shape as AnyType),
                    projectUuid: z.string(),
                },
            },
            async (_args, context) => {
                const args = _args as ToolFindFieldsArgs & {
                    projectUuid: string;
                };

                const findFields: FindFieldFn =
                    await this.getFindFieldsFunction(
                        args,
                        context as McpContext,
                    );

                const findFieldsTool = getFindFields({
                    findFields,
                    pageSize: 15,
                });
                const result = await findFieldsTool.execute(args, {
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
    }

    async getFindExploresFunction(
        toolArgs: ToolFindExploresArgs & { projectUuid: string },
        context: McpContext,
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
        context: McpContext,
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

    public getServer(): McpServer {
        return this.mcpServer;
    }

    public canAccessMcp(context: McpContext): boolean {
        if (!context.authInfo) {
            throw new ForbiddenError('Invalid authInfo context');
        }

        const user = context.authInfo.extra?.user;
        const account = context.authInfo.extra?.account;
        const { scopes } = account.authentication;

        // TODO replace with CASL ability check
        if (
            !scopes.includes(OAuthScope.MCP_READ) &&
            !scopes.includes(OAuthScope.MCP_WRITE)
        ) {
            throw new ForbiddenError('You are not allowed to access MCP');
        }

        if (!this.lightdashConfig.mcp.enabled) {
            throw new MissingConfigError('MCP is not enabled');
        }

        return true;
    }

    public getLightdashVersion(context: McpContext): string {
        this.canAccessMcp(context);
        return VERSION;
    }
}
