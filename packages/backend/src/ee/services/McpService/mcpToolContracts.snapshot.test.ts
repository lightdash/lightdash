import { Ability } from '@casl/ability';
import {
    defineUserAbility,
    FeatureFlags,
    mcpToolDefinitions,
    OrganizationMemberRole,
    ProjectMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { ZodRawShape, ZodType } from 'zod';
import { z } from 'zod';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    getMcpAnalystPrompt,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { isProjectScopedMcpTool, McpService, McpToolName } from './McpService';

type RegisteredMcpTool = {
    name: string;
    config: {
        title: string;
        description: string;
        inputSchema: ZodRawShape;
        annotations: Record<string, unknown>;
        outputSchema?: ZodRawShape | ZodType;
        _meta?: Record<string, unknown>;
    };
};

type RegisteredMcpPrompt = {
    name: string;
    config: {
        title?: string;
        description?: string;
        argsSchema?: ZodRawShape;
    };
};

const mockRegisteredMcpTools: RegisteredMcpTool[] = [];
const mockRegisteredMcpPrompts: RegisteredMcpPrompt[] = [];

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                server: {
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
                },
                registerResource: vi.fn(),
                registerPrompt: vi.fn(
                    (
                        name: string,
                        config: RegisteredMcpPrompt['config'],
                        _callback: unknown,
                    ) => {
                        mockRegisteredMcpPrompts.push({ name, config });
                        return {};
                    },
                ),
                registerTool: vi.fn(
                    (
                        name: string,
                        config: RegisteredMcpTool['config'],
                        _callback: unknown,
                    ) => {
                        mockRegisteredMcpTools.push({ name, config });
                        return {};
                    },
                ),
            };
        },
    ),
}));

const schemaToJson = (
    schema: ZodType | ZodRawShape | undefined,
    io: 'input' | 'output',
): unknown => {
    if (!schema) {
        return null;
    }

    return z.toJSONSchema(
        schema instanceof z.ZodType ? schema : z.object(schema),
        {
            target: 'draft-07',
            io,
            reused: 'inline',
            cycles: 'throw',
        },
    );
};

const makeMcpService = (
    mcpContentWritesEnabled = true,
    featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: false }),
    },
): McpService =>
    new McpService({
        aiAgentService: {},
        aiAgentToolsService: { createRuntime: vi.fn() },
        aiOrganizationSettingsService: {
            isMcpContentWritesEnabled: vi
                .fn()
                .mockResolvedValue(mcpContentWritesEnabled),
        },
        aiRouterService: {},
        aiWritebackService: {},
        analytics: {},
        asyncQueryService: {},
        catalogService: {},
        contentService: {},
        contentVerificationService: {},
        featureFlagService,
        lightdashConfig: {
            mcp: {
                runSqlMaxLimit: 500,
            },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: {},
        projectModel: {},
        projectService: {},
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

const makeServiceWithContextProject = (projectUuid?: string): McpService => {
    const service = makeMcpService();
    (
        service as unknown as {
            mcpContextModel: {
                getContext: (...args: unknown[]) => unknown;
            };
        }
    ).mcpContextModel = {
        getContext: vi
            .fn()
            .mockResolvedValue(
                projectUuid ? { context: { projectUuid } } : undefined,
            ),
    };
    return service;
};

const sharedMcpToolDefinitionNames = mcpToolDefinitions.map(
    (toolDefinition) => toolDefinition.for('mcp').name,
);

const inputSchemaRequirements = z.object({
    required: z.array(z.string()).optional(),
});

describe('MCP tool contracts', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
    });

    it('matches the shared MCP tool definition names snapshot', () => {
        expect(sharedMcpToolDefinitionNames).toMatchSnapshot();
    });

    it('resolves the filter-expression feature flag for the request user', async () => {
        const get = vi.fn().mockResolvedValue({ enabled: true });
        const mcpService = makeMcpService(true, { get });

        await expect(
            mcpService.isFilterExpressionsEnabled(defaultSessionUser),
        ).resolves.toBe(true);
        expect(get).toHaveBeenCalledWith({
            user: defaultSessionUser,
            featureFlagId: FeatureFlags.AiFilterExpressions,
        });
    });

    it('uses the grep-fields MCP analyst prompt', () => {
        const prompt = getMcpAnalystPrompt();

        expect(prompt).toContain('grep_fields');
        expect(prompt).toContain('get_metadata');
        expect(prompt).not.toContain('find_explores');
        expect(prompt).not.toContain('find_fields');
    });

    it('skips semantic discovery for complete raw SQL', () => {
        const guidance =
            'follow step 0, then skip steps 1–3 and call `run_sql`';

        expect(getMcpAnalystPrompt()).toContain(guidance);
        expect(getMcpAnalystPrompt({ runSqlEnabled: false })).not.toContain(
            guidance,
        );
    });

    it('matches the current MCP tool and prompt contract snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
        await mcpService.createServer({
            aiWritebackEnabled: true,
            runSqlEnabled: true,
            runMetricQueryEnabled: true,
        });

        const prompts = mockRegisteredMcpPrompts.map(({ name, config }) => ({
            name,
            title: config.title,
            description: config.description,
            argsSchema: schemaToJson(config.argsSchema, 'input'),
            prompt: name === 'lightdash-analyst' ? MCP_ANALYST_PROMPT : null,
        }));
        const tools = mockRegisteredMcpTools.map(({ name, config }) => ({
            name,
            agentName:
                name === McpToolName.RUN_METRIC_QUERY ? 'runQuery' : null,
            title: config.title,
            description: config.description,
            annotations: config.annotations,
            inputSchema: schemaToJson(config.inputSchema, 'input'),
            ...(config.outputSchema
                ? { outputSchema: schemaToJson(config.outputSchema, 'output') }
                : {}),
        }));

        expect(
            tools
                .filter(({ inputSchema }) =>
                    JSON.stringify(inputSchema).includes('"$ref"'),
                )
                .map(({ name }) => name),
        ).toEqual([]);

        expect({ prompts, tools }).toMatchSnapshot();
    });

    it('does not register semantic-layer tools without runMetricQueryEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            aiWritebackEnabled: true,
            runSqlEnabled: false,
            runMetricQueryEnabled: false,
        });

        const registeredNames = mockRegisteredMcpTools.map(({ name }) => name);
        expect(registeredNames).not.toContain(McpToolName.LIST_EXPLORES);
        expect(registeredNames).not.toContain(McpToolName.GREP_FIELDS);
        expect(registeredNames).not.toContain(McpToolName.GET_METADATA);
        expect(registeredNames).not.toContain(McpToolName.SEARCH_FIELD_VALUES);
        expect(registeredNames).not.toContain(McpToolName.RUN_METRIC_QUERY);
        expect(registeredNames).not.toContain(McpToolName.RENDER_CHART);
        expect(registeredNames).not.toContain(McpToolName.GET_QUERY_RESULT);
        expect(registeredNames).toContain(McpToolName.FIND_CONTENT);
        expect(registeredNames).toContain(McpToolName.LIST_CONTENT);
    });

    it('registers only SQL execution tools when metric queries are disabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            aiWritebackEnabled: true,
            runSqlEnabled: true,
            runMetricQueryEnabled: false,
        });

        const registeredNames = mockRegisteredMcpTools.map(({ name }) => name);
        expect(registeredNames).toContain(McpToolName.RUN_SQL);
        expect(registeredNames).toContain(McpToolName.GET_QUERY_RESULT);
        expect(registeredNames).not.toContain(McpToolName.RENDER_CHART);
        expect(registeredNames).not.toContain(McpToolName.RUN_METRIC_QUERY);
    });

    it('matches the filter-expression run_metric_query tools/list snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            runMetricQueryEnabled: true,
            filterExpressionsEnabled: true,
        });

        const registered = mockRegisteredMcpTools.find(
            ({ name }) => name === McpToolName.RUN_METRIC_QUERY,
        );
        expect(registered).toBeDefined();
        expect({
            name: registered?.name,
            title: registered?.config.title,
            description: registered?.config.description,
            annotations: registered?.config.annotations,
            inputSchema: schemaToJson(registered?.config.inputSchema, 'input'),
            outputSchema: schemaToJson(
                registered?.config.outputSchema,
                'output',
            ),
        }).toMatchSnapshot();
    });

    it('matches the filter-expression search_field_values tools/list snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            runMetricQueryEnabled: true,
            filterExpressionsEnabled: true,
        });

        const registered = mockRegisteredMcpTools.find(
            ({ name }) => name === McpToolName.SEARCH_FIELD_VALUES,
        );
        if (!registered) {
            throw new Error('search_field_values was not registered');
        }

        const inputSchema = z.object(registered.config.inputSchema);
        const baseArgs = {
            table: 'orders',
            fieldId: 'orders_status',
            projectUuid: '00000000-0000-0000-0000-000000000000',
        };
        const omittedFilters = inputSchema.parse(baseArgs);
        expect(omittedFilters).toMatchObject({ filters: null });
        expect(omittedFilters).toEqual(
            inputSchema.parse({ ...baseArgs, filters: null }),
        );
        expect({
            name: registered.name,
            title: registered.config.title,
            description: registered.config.description,
            annotations: registered.config.annotations,
            inputSchema: schemaToJson(registered.config.inputSchema, 'input'),
        }).toMatchSnapshot();
    });

    it('registers generate_hashes without project scope', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer();

        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.GENERATE_HASHES,
        );
        expect(isProjectScopedMcpTool(McpToolName.GENERATE_HASHES)).toBe(false);
    });

    it('requires projectUuid on every project-scoped tool', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer({
            aiWritebackEnabled: true,
            runSqlEnabled: true,
        });

        const toolsByName = new Map(
            mockRegisteredMcpTools.map((tool) => [tool.name, tool]),
        );
        const projectScopedTools = [...toolsByName.values()].filter(
            ({ name }) => isProjectScopedMcpTool(name),
        );

        const toolsWithoutProjectUuid = projectScopedTools
            .filter(({ config }) => {
                const inputSchema = inputSchemaRequirements.parse(
                    schemaToJson(config.inputSchema, 'input'),
                );
                return !inputSchema.required?.includes('projectUuid');
            })
            .map(({ name }) => name);

        expect(toolsWithoutProjectUuid).toEqual([]);
    });

    it('registers run_sql only when runSqlEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runSqlEnabled: true });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.RUN_SQL,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runSqlEnabled: false });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.RUN_SQL,
        );
    });

    it('registers run_metric_query only when runMetricQueryEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runMetricQueryEnabled: true });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.RUN_METRIC_QUERY,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runMetricQueryEnabled: false });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.RUN_METRIC_QUERY,
        );
    });

    describe('isRunSqlEnabled', () => {
        const ORG_UUID = 'org-1';
        const PROJECT_A = 'project-a';
        const PROJECT_B = 'project-b';

        const buildUser = (
            orgRole: OrganizationMemberRole,
            projectProfiles: {
                projectUuid: string;
                role: ProjectMemberRole;
            }[] = [],
        ): SessionUser => {
            const userUuid = 'user-1';
            const ability = defineUserAbility(
                {
                    role: orgRole,
                    organizationUuid: ORG_UUID,
                    userUuid,
                    roleUuid: undefined,
                },
                projectProfiles.map((profile) => ({
                    ...profile,
                    userUuid,
                    roleUuid: undefined,
                })),
            );
            return {
                userUuid,
                organizationUuid: ORG_UUID,
                ability,
            } as unknown as SessionUser;
        };

        it('is false for a viewer of the pinned project', async () => {
            const service = makeServiceWithContextProject();
            const viewer = buildUser(OrganizationMemberRole.VIEWER, [
                { projectUuid: PROJECT_A, role: ProjectMemberRole.VIEWER },
            ]);
            expect(await service.isRunSqlEnabled(viewer, PROJECT_A)).toBe(
                false,
            );
        });

        it('is true for a developer of the pinned project', async () => {
            const service = makeServiceWithContextProject();
            const developer = buildUser(OrganizationMemberRole.VIEWER, [
                { projectUuid: PROJECT_A, role: ProjectMemberRole.DEVELOPER },
            ]);
            expect(await service.isRunSqlEnabled(developer, PROJECT_A)).toBe(
                true,
            );
        });

        it('is false when the caller is a developer elsewhere but a viewer of the pinned project', async () => {
            const service = makeServiceWithContextProject();
            // Developer in project B, but only an org-viewer for project A.
            const user = buildUser(OrganizationMemberRole.VIEWER, [
                { projectUuid: PROJECT_B, role: ProjectMemberRole.DEVELOPER },
            ]);
            expect(await service.isRunSqlEnabled(user, PROJECT_A)).toBe(false);
            expect(await service.isRunSqlEnabled(user, PROJECT_B)).toBe(true);
        });

        it('does not let legacy context mutate unpinned tool availability', async () => {
            const service = makeServiceWithContextProject(PROJECT_A);
            const developer = buildUser(OrganizationMemberRole.VIEWER, [
                { projectUuid: PROJECT_B, role: ProjectMemberRole.DEVELOPER },
            ]);

            expect(await service.isRunSqlEnabled(developer)).toBe(true);
        });

        it('falls back to the coarse capability check when no project is resolved', async () => {
            const service = makeServiceWithContextProject();
            const orgDeveloper = buildUser(OrganizationMemberRole.DEVELOPER);
            const orgViewer = buildUser(OrganizationMemberRole.VIEWER);
            expect(await service.isRunSqlEnabled(orgDeveloper)).toBe(true);
            expect(await service.isRunSqlEnabled(orgViewer)).toBe(false);
        });
    });

    describe('isRunMetricQueryEnabled', () => {
        const ORG_UUID = 'org-1';
        const PROJECT_UUID = 'project-a';

        const buildUser = (
            orgRole: OrganizationMemberRole,
            projectRole?: ProjectMemberRole,
        ): SessionUser => {
            const userUuid = 'user-1';
            const ability = defineUserAbility(
                {
                    role: orgRole,
                    organizationUuid: ORG_UUID,
                    userUuid,
                    roleUuid: undefined,
                },
                projectRole
                    ? [
                          {
                              projectUuid: PROJECT_UUID,
                              role: projectRole,
                              userUuid,
                              roleUuid: undefined,
                          },
                      ]
                    : [],
            );
            return {
                userUuid,
                organizationUuid: ORG_UUID,
                ability,
            } as unknown as SessionUser;
        };

        it('is false for a viewer of the pinned project', async () => {
            const service = makeServiceWithContextProject();
            const viewer = buildUser(
                OrganizationMemberRole.VIEWER,
                ProjectMemberRole.VIEWER,
            );

            expect(
                await service.isRunMetricQueryEnabled(viewer, PROJECT_UUID),
            ).toBe(false);
        });

        it('is true for an interactive viewer of the pinned project', async () => {
            const service = makeServiceWithContextProject();
            const interactiveViewer = buildUser(
                OrganizationMemberRole.VIEWER,
                ProjectMemberRole.INTERACTIVE_VIEWER,
            );

            expect(
                await service.isRunMetricQueryEnabled(
                    interactiveViewer,
                    PROJECT_UUID,
                ),
            ).toBe(true);
        });

        it('does not let legacy context mutate unpinned tool availability', async () => {
            const service = makeServiceWithContextProject('another-project');
            const interactiveViewer = buildUser(
                OrganizationMemberRole.VIEWER,
                ProjectMemberRole.INTERACTIVE_VIEWER,
            );

            expect(
                await service.isRunMetricQueryEnabled(interactiveViewer),
            ).toBe(true);
        });
    });

    it('registers content and scheduled-delivery tools independently', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            mcpContentWritesEnabled: false,
            scheduledDeliveryEnabled: true,
        });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.CREATE_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.EDIT_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.CREATE_SCHEDULED_DELIVERY,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            mcpContentWritesEnabled: true,
            scheduledDeliveryEnabled: false,
        });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.CREATE_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.EDIT_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.CREATE_SCHEDULED_DELIVERY,
        );
    });

    it.each<{
        settingEnabled: boolean;
        rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0];
        expected: boolean;
    }>([
        {
            settingEnabled: false,
            rules: [{ action: 'create', subject: 'ScheduledDeliveries' }],
            expected: false,
        },
        { settingEnabled: true, rules: [], expected: false },
        {
            settingEnabled: true,
            rules: [{ action: 'create', subject: 'ScheduledDeliveries' }],
            expected: true,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'manage', subject: 'ScheduledDeliveries' }],
            expected: true,
        },
    ])(
        'gates scheduled delivery registration by setting and permission',
        async ({ settingEnabled, rules, expected }) => {
            const mcpService = makeMcpService(settingEnabled);
            const user: SessionUser = {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>(rules),
            };

            await expect(
                mcpService.isCreateScheduledDeliveryEnabled(user),
            ).resolves.toBe(expected);
        },
    );

    it.each<{
        settingEnabled: boolean;
        rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0];
        expected: boolean;
    }>([
        {
            settingEnabled: false,
            rules: [{ action: 'create', subject: 'ContentAsCode' }],
            expected: false,
        },
        {
            settingEnabled: true,
            rules: [],
            expected: false,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'create', subject: 'ContentAsCode' }],
            expected: true,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'manage', subject: 'ContentAsCode' }],
            expected: true,
        },
    ])(
        'gates MCP content tools by setting and permission',
        async ({ settingEnabled, rules, expected }) => {
            const mcpService = makeMcpService(settingEnabled);
            const user: SessionUser = {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>(rules),
            };

            await expect(mcpService.isContentToolsEnabled(user)).resolves.toBe(
                expected,
            );
        },
    );
});
