import { Ability } from '@casl/ability';
import {
    COMPOSER_QUERYING_SKILL_POINTER,
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
import { MCP_FILTER_EXPRESSION_GUIDANCE_SECTION } from '../ai/prompts/filterGuidance';
import { getMcpAnalystPrompt } from '../ai/prompts/mcpAnalyst';
import { BuiltInSkills } from '../ai/skills/builtInSkills';
import { MCP_CUSTOM_CHART_FRAME_TOOL_NAME } from './mcpCustomChartFrameHtml';
import type { McpQueryPath } from './mcpQueryPath';
import {
    isProjectScopedMcpTool,
    McpService,
    McpToolName,
    type McpServerToolOptions,
} from './McpService';
import { classicQueryPath, makeMcpServerOptions } from './McpService.mock';

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
    callback: () => Promise<{
        messages: Array<{ content: { type: string; text: string } }>;
    }>;
};

const mockRegisteredMcpTools: RegisteredMcpTool[] = [];
const mockRegisteredMcpPrompts: RegisteredMcpPrompt[] = [];
const mockMcpServerInstructions: Array<string | undefined> = [];
const mockRegisteredMcpResourceUris: string[] = [];

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@modelcontextprotocol/sdk/server/mcp.js')
    >()),
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer(
            _serverInfo: unknown,
            options?: { instructions?: string },
        ) {
            mockMcpServerInstructions.push(options?.instructions);
            return {
                server: {
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
                },
                registerResource: vi.fn((_name: string, uri: string) => {
                    mockRegisteredMcpResourceUris.push(uri);
                    return {};
                }),
                registerPrompt: vi.fn(
                    (
                        name: string,
                        config: RegisteredMcpPrompt['config'],
                        callback: RegisteredMcpPrompt['callback'],
                    ) => {
                        mockRegisteredMcpPrompts.push({
                            name,
                            config,
                            callback,
                        });
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
    canAuthorContent = true,
): McpService =>
    new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiAgentService: {},
        aiAgentToolsService: {
            canAuthorContent: vi.fn().mockResolvedValue(canAuthorContent),
            createRuntime: vi.fn(),
            listMcpSkillResources: () => BuiltInSkills.listMcpResources(),
            getMcpSkillResourceBody: (uri: string) =>
                BuiltInSkills.getMcpResourceBody(uri),
        },
        aiOrganizationSettingsService: {
            getMcpProjectAccess: vi.fn().mockResolvedValue({ mode: 'all' }),
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

const defaultMcpAnalystPromptOptions = {
    documentsEnabled: false,
    agentIdentityEnabled: false,
    queryPath: classicQueryPath(true, false),
};

const queryRunnerOptionCombinations = [false, true].flatMap(
    (sqlRunnerEnabled) =>
        [false, true].map((filterExpressionsEnabled) => ({
            sqlRunnerEnabled,
            filterExpressionsEnabled,
        })),
);
// Keyed by type so a new query path fails to compile until it is covered.
const mcpQueryPathsByType: {
    [T in McpQueryPath['type']]: Extract<McpQueryPath, { type: T }>[];
} = {
    contentOnly: [{ type: 'contentOnly' }],
    sqlOnly: [{ type: 'sqlOnly' }],
    classic: queryRunnerOptionCombinations.map((options) => ({
        type: 'classic',
        ...options,
    })),
    composer: queryRunnerOptionCombinations.map((options) => ({
        type: 'composer',
        ...options,
    })),
};
const mcpQueryPaths: McpQueryPath[] = Object.values(mcpQueryPathsByType).flat();

// Observed in Claude Code 2.1.263; this is not an MCP protocol limit.
const MCP_CLIENT_TEXT_MAX_CHARS = 2048;
// Budget chosen for the core composer rules on the query description (ADR 0010).
const MCP_QUERY_DESCRIPTION_MAX_CHARS = 4096;
const getMcpToolDescriptionMaxChars = (name: string) =>
    name === McpToolName.QUERY
        ? MCP_QUERY_DESCRIPTION_MAX_CHARS
        : MCP_CLIENT_TEXT_MAX_CHARS;

// Classify new features explicitly: registration-only or text-changing.
const registrationOnlyFeatures = {
    mcpContentWritesEnabled: true,
    scheduledDeliveryEnabled: true,
    dataAppBuildsEnabled: true,
    chartTypeBuildsEnabled: true,
    customChartTypesEnabled: true,
} satisfies Omit<
    McpServerToolOptions['featureAvailability'],
    keyof typeof defaultMcpAnalystPromptOptions
>;
const mcpOptionCombinations = mcpQueryPaths.flatMap((queryPath) =>
    [false, true].flatMap((documentsEnabled) =>
        [false, true].map((agentIdentityEnabled) => ({
            queryPath,
            documentsEnabled,
            agentIdentityEnabled,
        })),
    ),
);

const mcpTextConfigurations = mcpOptionCombinations.map((options) => ({
    ...registrationOnlyFeatures,
    ...options,
}));

const inputSchemaRequirements = z.object({
    required: z.array(z.string()).optional(),
});

const getLatestMcpServerInstructions = (): string => {
    const instructions = mockMcpServerInstructions.at(-1);
    if (instructions === undefined) {
        throw new Error('MCP server instructions were not registered');
    }
    return instructions;
};

describe('MCP tool contracts', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
        mockMcpServerInstructions.length = 0;
        mockRegisteredMcpResourceUris.length = 0;
    });

    it('matches the shared MCP tool definition names snapshot', () => {
        expect(sharedMcpToolDefinitionNames).toMatchSnapshot();
    });

    it('resolves agent identity for the request user', async () => {
        const get = vi.fn().mockResolvedValue({ enabled: true });
        const service = makeMcpService(true, { get });
        expect(await service.isAgentIdentityEnabled(defaultSessionUser)).toBe(
            true,
        );
        expect(get).toHaveBeenCalledWith({
            user: defaultSessionUser,
            featureFlagId: FeatureFlags.AgentIdentity,
        });
    });

    it.each(
        mcpQueryPaths.map((queryPath) => ({
            queryPath,
            rule: queryPath.type !== 'contentOnly',
        })),
    )(
        'gates the connect rule in the prompt variant $queryPath',
        ({ rule, queryPath }) => {
            const options = {
                ...defaultMcpAnalystPromptOptions,
                queryPath,
            };
            const connectRule = 'refuses with a connect link';
            const flagOn = getMcpAnalystPrompt({
                ...options,
                agentIdentityEnabled: true,
            });
            if (rule) expect(flagOn).toContain(connectRule);
            else expect(flagOn).not.toContain(connectRule);
            expect(
                getMcpAnalystPrompt({
                    ...options,
                    agentIdentityEnabled: false,
                }),
            ).not.toContain(connectRule);
        },
    );

    it('matches the agent-identity tools and instructions snapshot', async () => {
        const service = makeMcpService();
        mockRegisteredMcpTools.length = 0;
        await service.createServer(
            makeMcpServerOptions({
                queryPath: classicQueryPath(true, false),
                agentIdentityEnabled: true,
            }),
        );
        const tools = mockRegisteredMcpTools
            .filter(({ name }) =>
                [
                    McpToolName.CONNECT_AGENT,
                    McpToolName.RUN_SQL,
                    McpToolName.RUN_METRIC_QUERY,
                ].includes(name as McpToolName),
            )
            .map(({ name, config }) =>
                name === McpToolName.CONNECT_AGENT
                    ? {
                          name,
                          ...config,
                          inputSchema: schemaToJson(
                              config.inputSchema,
                              'input',
                          ),
                          outputSchema: schemaToJson(
                              config.outputSchema,
                              'output',
                          ),
                      }
                    : { name, description: config.description },
            );
        expect({
            instructions: getLatestMcpServerInstructions(),
            tools,
        }).toMatchSnapshot();
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

    it('gates Document schemas per request without leaking between callers', async () => {
        const service = makeMcpService();
        for (const documentsEnabled of [false, true, false]) {
            mockRegisteredMcpTools.length = 0;
            // Sequential requests verify that registration does not retain the previous caller's flag.
            // eslint-disable-next-line no-await-in-loop
            await service.createServer(
                makeMcpServerOptions({ documentsEnabled }),
            );
            for (const name of [
                'create_content',
                'read_content',
                'edit_content',
            ]) {
                const tool = mockRegisteredMcpTools.find(
                    (entry) => entry.name === name,
                );
                expect(tool).toBeDefined();
                if (!tool) {
                    throw new Error(`Missing tool ${name}`);
                }
                expect(tool.config.description.includes('Document')).toBe(
                    documentsEnabled,
                );
                if (name === 'create_content') {
                    expect(
                        tool.config.description.includes('research journey'),
                    ).toBe(documentsEnabled);
                    if (documentsEnabled) {
                        expect(tool.config.description).toContain(
                            'rather than inventing findings or steps',
                        );
                    }
                }
                expect(
                    z.safeParse(tool.config.inputSchema.type, 'document')
                        .success,
                ).toBe(documentsEnabled);
                expect(
                    z.safeParse(tool.config.inputSchema.type, 'chart').success,
                ).toBe(true);
                expect(
                    z.safeParse(tool.config.inputSchema.type, 'dashboard')
                        .success,
                ).toBe(true);
                if (name === 'read_content') {
                    expect('chartId' in tool.config.inputSchema).toBe(
                        documentsEnabled,
                    );
                    expect(
                        z.safeParse(tool.config.inputSchema.slug, undefined)
                            .success,
                    ).toBe(false);
                }
                if (name === 'edit_content') {
                    expect('documentEdit' in tool.config.inputSchema).toBe(
                        documentsEnabled,
                    );
                    expect(
                        z.safeParse(tool.config.inputSchema.patch, undefined)
                            .success,
                    ).toBe(documentsEnabled);
                }
            }
        }
    });

    it('offers to save Documents from create_content only when Documents are enabled', async () => {
        const service = makeMcpService();
        const offer = 'offer once to save it as a Document the user can share';
        const createContentDescription = async (documentsEnabled: boolean) => {
            mockRegisteredMcpTools.length = 0;
            await service.createServer(
                makeMcpServerOptions({ documentsEnabled }),
            );
            return mockRegisteredMcpTools.find(
                ({ name }) => name === 'create_content',
            )?.config.description;
        };

        expect(await createContentDescription(true)).toContain(offer);
        expect(await createContentDescription(false)).not.toContain(offer);
    });

    it('uses the grep-fields MCP analyst prompt', () => {
        const prompt = getMcpAnalystPrompt(defaultMcpAnalystPromptOptions);

        expect(prompt).toContain('grep_fields');
        expect(prompt).toContain('get_metadata');
        expect(prompt).not.toContain('find_explores');
        expect(prompt).not.toContain('find_fields');
    });

    it('skips semantic discovery for complete raw SQL', () => {
        const guidance =
            'follow step 0, then skip steps 1–3 and call `run_sql`';

        expect(getMcpAnalystPrompt(defaultMcpAnalystPromptOptions)).toContain(
            guidance,
        );
        expect(
            getMcpAnalystPrompt({
                ...defaultMcpAnalystPromptOptions,
                queryPath: classicQueryPath(false, false),
            }),
        ).not.toContain(guidance);
    });

    it('matches initialization guidance to the filter contract', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: classicQueryPath(false, false),
            }),
        );
        expect(getLatestMcpServerInstructions()).not.toContain(
            MCP_FILTER_EXPRESSION_GUIDANCE_SECTION,
        );

        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: classicQueryPath(false, true),
            }),
        );
        expect(getLatestMcpServerInstructions()).not.toContain(
            MCP_FILTER_EXPRESSION_GUIDANCE_SECTION,
        );
        expect(getLatestMcpServerInstructions()).toContain(
            'read the shared skill',
        );
    });

    it.each([false, true])(
        'links both expression-enabled tools to the shared skill: expressions=%s',
        async (filterExpressionsEnabled) => {
            const mcpService = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await mcpService.createServer(
                makeMcpServerOptions({
                    queryPath: classicQueryPath(
                        false,
                        filterExpressionsEnabled,
                    ),
                }),
            );
            for (const name of [
                McpToolName.RUN_METRIC_QUERY,
                McpToolName.SEARCH_FIELD_VALUES,
            ]) {
                const tool = mockRegisteredMcpTools.find(
                    (registered) => registered.name === name,
                );
                expect(tool).toBeDefined();
                expect(
                    tool?.config.description.includes(
                        'read the `filter-expressions` skill',
                    ),
                ).toBe(filterExpressionsEnabled);
            }
            const skill =
                await BuiltInSkills.readSkillTool('filter-expressions');
            expect(skill?.body).toContain(
                'Each category is flat and uses AND or OR, never both.',
            );
        },
    );

    it.each<{ name: string; queryPath: McpQueryPath }>([
        {
            name: 'structured-filter',
            queryPath: classicQueryPath(true, false),
        },
        {
            name: 'filter-expression',
            queryPath: classicQueryPath(true, true),
        },
        {
            name: 'composer with SQL Runner',
            queryPath: {
                type: 'composer',
                sqlRunnerEnabled: true,
                filterExpressionsEnabled: false,
            },
        },
        {
            name: 'composer without SQL Runner',
            queryPath: {
                type: 'composer',
                sqlRunnerEnabled: false,
                filterExpressionsEnabled: false,
            },
        },
    ])(
        'matches the $name MCP server instructions snapshot',
        async ({ queryPath }) => {
            const mcpService = makeMcpService();

            await mcpService.createServer(makeMcpServerOptions({ queryPath }));

            expect(getLatestMcpServerInstructions()).toMatchSnapshot();
        },
    );

    it('covers every instruction/filter configuration exactly once', () => {
        // query paths × documents on/off × agent identity on/off
        const expectedCount = mcpQueryPaths.length * 2 * 2;
        expect(mcpOptionCombinations).toHaveLength(expectedCount);
        expect(
            new Set(
                mcpOptionCombinations.map((options) => JSON.stringify(options)),
            ).size,
        ).toBe(expectedCount);
    });

    it.each(mcpTextConfigurations)(
        `keeps registered MCP tool descriptions within their char budget: $queryPath docs=$documentsEnabled agent=$agentIdentityEnabled`,
        async (options) => {
            const configuration = JSON.stringify(options);
            const mcpService = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await mcpService.createServer(makeMcpServerOptions(options));

            expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
                McpToolName.FIND_CONTENT,
            );
            mockRegisteredMcpTools.forEach(({ name, config }) => {
                const { length } = config.description;
                const maxChars = getMcpToolDescriptionMaxChars(name);
                expect
                    .soft(
                        length,
                        `${configuration}: ${name} is ${length} chars, exceeding ${maxChars}; shorten the text instead of updating snapshots`,
                    )
                    .toBeLessThanOrEqual(maxChars);
            });
        },
    );

    it.each(mcpTextConfigurations)(
        'keeps pagination guidance on registered input fields: $queryPath docs=$documentsEnabled agent=$agentIdentityEnabled',
        async (options) => {
            const service = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await service.createServer(makeMcpServerOptions(options));
            const paginatedTools = mockRegisteredMcpTools.filter(
                ({ config }) => config.inputSchema.page !== undefined,
            );
            expect(paginatedTools.map(({ name }) => name)).toContain(
                McpToolName.LIST_CONTENT,
            );
            for (const { config } of paginatedTools) {
                expect(schemaToJson(config.inputSchema, 'input')).toMatchObject(
                    {
                        properties: {
                            page: {
                                description:
                                    'Paginate results starting at 1. Pass a positive number (e.g. 1), never NaN or the string "null".',
                            },
                        },
                    },
                );
            }
            const instructions = getLatestMcpServerInstructions();
            expect(instructions).not.toContain('### Pagination');
            expect(instructions).not.toContain('Page parameters');
            expect(instructions).not.toContain('NaN');
        },
    );

    it.each(mcpTextConfigurations)(
        'keeps registered MCP server instructions within the client text limit: $queryPath docs=$documentsEnabled agent=$agentIdentityEnabled',
        async (options) => {
            const configuration = JSON.stringify(options);
            const mcpService = makeMcpService();
            await mcpService.createServer(makeMcpServerOptions(options));
            expect(
                getLatestMcpServerInstructions().length,
                `${configuration}: server instructions exceed the client text limit; shorten the text instead of updating snapshots`,
            ).toBeLessThanOrEqual(MCP_CLIENT_TEXT_MAX_CHARS);
        },
    );

    it.each([false, true])(
        'keeps workflow details on their registered tools: expressions=%s',
        async (filterExpressionsEnabled) => {
            const service = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await service.createServer(
                makeMcpServerOptions({
                    queryPath: classicQueryPath(true, filterExpressionsEnabled),
                }),
            );
            const guidance = [
                {
                    name: McpToolName.RUN_METRIC_QUERY,
                    details: [
                        'If the user mentions any time period, add an explicit date filter; never use sort + limit instead.',
                        'Use inThePast for relative windows.',
                        'Date fields from joined tables work identically in filters.',
                        'Add a customMetrics entry only after grep_fields / get_metadata confirm no existing metric fits.',
                    ],
                },
                {
                    name: McpToolName.GREP_FIELDS,
                    details: [
                        'cover every angle of the question in one call',
                        'long natural-language phrases',
                        'right grain',
                    ],
                },
                {
                    name: McpToolName.GET_METADATA,
                    details: [
                        'required filters',
                        'filter type, case-sensitivity',
                        'Batch every explore and field you need into one call',
                    ],
                },
                {
                    name: McpToolName.GET_CONTEXT,
                    details: [
                        'use route_agent',
                        'returned agentUuid explicitly',
                        'pass its agentUuid explicitly',
                    ],
                },
                {
                    name: McpToolName.SEARCH_FIELD_VALUES,
                    details: [
                        'dimension (e.g. a name or status) before filtering on it',
                        'already gives the exact value, filter on it directly',
                    ],
                },
                {
                    name: McpToolName.GET_QUERY_RESULT,
                    details: [
                        'until done, error, cancelled, or expired',
                        'same queryUuid',
                        'never resubmit the query',
                    ],
                },
                {
                    name: McpToolName.RENDER_CHART,
                    details: [
                        'Pass the exact queryUuid',
                        'run_metric_query or get_query_result',
                        'SQL Runner/run_sql results are not supported',
                    ],
                },
                {
                    name: McpToolName.LIST_CONTENT,
                    details: ['child spaces and content inside one space'],
                },
                {
                    name: McpToolName.FIND_CONTENT,
                    details: ['dashboards', 'Data Apps'],
                },
            ];
            for (const { name, details } of guidance) {
                const tool = mockRegisteredMcpTools.find(
                    (registered) => registered.name === name,
                );
                expect(tool).toBeDefined();
                const text = `${tool?.config.description}\n${JSON.stringify(
                    schemaToJson(tool?.config.inputSchema, 'input'),
                )}`;
                for (const detail of details) {
                    expect(text).toContain(detail);
                }
            }
        },
    );

    it.each([false, true])(
        'defers detailed polling guidance to results: expressions=%s',
        async (filterExpressionsEnabled) => {
            const mcpService = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await mcpService.createServer(
                makeMcpServerOptions({
                    queryPath: classicQueryPath(true, filterExpressionsEnabled),
                }),
            );
            const queryTools = mockRegisteredMcpTools.filter(({ name }) =>
                [
                    McpToolName.RUN_SQL,
                    McpToolName.RUN_METRIC_QUERY,
                    McpToolName.GET_QUERY_RESULT,
                ].some((toolName) => toolName === name),
            );
            expect(queryTools).toHaveLength(3);
            for (const { name, config } of queryTools) {
                expect(
                    config.description.includes(
                        'follow the polling instructions in the response',
                    ),
                ).toBe(name !== McpToolName.GET_QUERY_RESULT);
                expect(config.description).not.toContain(
                    'retry get_query_result',
                );
                expect(config.description).not.toContain(
                    'Warehouse execution timeouts',
                );
                expect(config.description).not.toMatch(
                    /structuredContent|isError|result\.status/,
                );
                expect(config.description).toContain('same queryUuid');
                expect(config.description).toContain('Stop on terminal errors');
            }
        },
    );

    it.each([false, true])(
        'keeps calculation and visualization guidance on MCP tools: expressions=%s',
        async (filterExpressionsEnabled) => {
            const service = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await service.createServer(
                makeMcpServerOptions({
                    queryPath: classicQueryPath(true, filterExpressionsEnabled),
                }),
            );
            const query = mockRegisteredMcpTools.find(
                ({ name }) => name === McpToolName.RUN_METRIC_QUERY,
            );
            expect(query?.config.description).toContain(
                'Before authoring table calculations, read the `table-calculations` skill. Use type `formula`.',
            );
            const sql = mockRegisteredMcpTools.find(
                ({ name }) => name === McpToolName.RUN_SQL,
            );
            expect(sql).toBeDefined();
            expect(sql?.config.description).not.toContain('table-calculations');
            const render = mockRegisteredMcpTools.find(
                ({ name }) => name === McpToolName.RENDER_CHART,
            );
            for (const detail of [
                'Supported types: table, bar, horizontal_bar, line, scatter, pie, funnel',
                "For time series: use `line` with `xAxisType: 'time'`",
                'For categorical comparisons: use `bar` or `horizontal_bar`',
                'For single values or detailed data: use `table`',
                'Always provide axis labels',
            ]) {
                expect(render?.config.description).toContain(detail);
            }
            expect(mockRegisteredMcpResourceUris).toContain(
                'skill://lightdash/table-calculations/SKILL.md',
            );
            expect(
                (await BuiltInSkills.readSkillTool('table-calculations'))?.body,
            ).toContain('MOVING_AVG(m, 2, ORDER BY date)');
        },
    );

    it.each([false, true])(
        'keeps artifact integration pointers in short MCP descriptions: expressions=%s',
        async (filterExpressionsEnabled) => {
            const service = makeMcpService();
            await service.createServer(
                makeMcpServerOptions({
                    queryPath: classicQueryPath(true, filterExpressionsEnabled),
                }),
            );
            for (const name of [
                'run_sql',
                'run_metric_query',
                'get_query_result',
                'render_chart',
            ]) {
                const tool = mockRegisteredMcpTools.find(
                    (registered) => registered.name === name,
                );
                expect(tool).toBeDefined();
                expect(tool?.config.description).toContain(
                    'read_skill with name: "mcp-artifact-integration"',
                );
                expect(tool?.config.description).not.toContain(
                    'Response shape',
                );
                expect(tool?.config.description.length).toBeLessThanOrEqual(
                    MCP_CLIENT_TEXT_MAX_CHARS,
                );
            }
            expect(mockRegisteredMcpResourceUris).toEqual(
                expect.arrayContaining([
                    'skill://index.json',
                    'skill://lightdash/mcp-artifact-integration/SKILL.md',
                    'skill://lightdash/mcp-artifact-integration/resources/result-contracts.md',
                ]),
            );
        },
    );

    it('matches the current MCP tool and prompt contract snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: {
                    type: 'composer',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: false,
                },
                dataAppBuildsEnabled: true,
                chartTypeBuildsEnabled: true,
                customChartTypesEnabled: true,
            }),
        );

        const prompts = await Promise.all(
            mockRegisteredMcpPrompts.map(
                async ({ name, config, callback }) => ({
                    name,
                    title: config.title,
                    description: config.description,
                    argsSchema: schemaToJson(config.argsSchema, 'input'),
                    prompt:
                        name === 'lightdash-analyst'
                            ? (await callback()).messages[0].content.text
                            : null,
                }),
            ),
        );
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

    it('registers the chart type frame tool for the chart view only', async () => {
        const mcpService = makeMcpService();
        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({ queryPath: classicQueryPath(false, false) }),
        );
        const tool = mockRegisteredMcpTools.find(
            ({ name }) => name === MCP_CUSTOM_CHART_FRAME_TOOL_NAME,
        );
        expect(McpToolName.GET_CUSTOM_CHART_TYPE_FRAME).toBe(
            MCP_CUSTOM_CHART_FRAME_TOOL_NAME,
        );
        expect(tool?.config._meta).toEqual({ ui: { visibility: ['app'] } });
    });

    it('matches the filter-expression run_metric_query tools/list snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: classicQueryPath(false, true),
            }),
        );

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
        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: classicQueryPath(false, true),
            }),
        );

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

    it.each([undefined, '00000000-0000-4000-8000-000000000001'])(
        'derives project-switching availability from pinnedProjectUuid=%s',
        async (pinnedProjectUuid) => {
            const mcpService = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await mcpService.createServer(
                makeMcpServerOptions({}, pinnedProjectUuid),
            );
            const names = mockRegisteredMcpTools.map(({ name }) => name);
            expect(names.includes(McpToolName.LIST_PROJECTS)).toBe(
                pinnedProjectUuid === undefined,
            );
        },
    );

    it('registers generate_hashes without project scope', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer(makeMcpServerOptions());

        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.GENERATE_HASHES,
        );
        expect(isProjectScopedMcpTool(McpToolName.GENERATE_HASHES)).toBe(false);
    });

    it('requires projectUuid on every project-scoped tool', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: { type: 'sqlOnly' },
            }),
        );

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

    const queryToolNames = [
        McpToolName.LIST_EXPLORES,
        McpToolName.GREP_FIELDS,
        McpToolName.GET_METADATA,
        McpToolName.SEARCH_FIELD_VALUES,
        McpToolName.RUN_METRIC_QUERY,
        McpToolName.GET_CUSTOM_CHART_TYPE_FRAME,
        McpToolName.RENDER_CHART,
        McpToolName.RUN_SQL,
        McpToolName.QUERY,
        McpToolName.GET_QUERY_RESULT,
    ];
    const classicQueryTools = [
        McpToolName.LIST_EXPLORES,
        McpToolName.GREP_FIELDS,
        McpToolName.GET_METADATA,
        McpToolName.RUN_METRIC_QUERY,
        McpToolName.GET_CUSTOM_CHART_TYPE_FRAME,
        McpToolName.RENDER_CHART,
        McpToolName.SEARCH_FIELD_VALUES,
    ];

    it.each<{
        name: string;
        queryPath: McpQueryPath;
        tools: McpToolName[];
        instructions: string;
    }>([
        {
            name: 'content only',
            queryPath: { type: 'contentOnly' },
            tools: [],
            instructions: 'Saved Content Mode',
        },
        {
            name: 'SQL only',
            queryPath: { type: 'sqlOnly' },
            tools: [McpToolName.RUN_SQL, McpToolName.GET_QUERY_RESULT],
            instructions: 'SQL Runner Mode',
        },
        {
            name: 'classic without SQL Runner',
            queryPath: {
                type: 'classic',
                sqlRunnerEnabled: false,
                filterExpressionsEnabled: false,
            },
            tools: [...classicQueryTools, McpToolName.GET_QUERY_RESULT],
            instructions: '4. `run_metric_query`',
        },
        {
            name: 'classic with SQL Runner',
            queryPath: {
                type: 'classic',
                sqlRunnerEnabled: true,
                filterExpressionsEnabled: false,
            },
            tools: [
                ...classicQueryTools,
                McpToolName.RUN_SQL,
                McpToolName.GET_QUERY_RESULT,
            ],
            instructions: '4. `run_metric_query`',
        },
        {
            name: 'composer',
            queryPath: {
                type: 'composer',
                sqlRunnerEnabled: false,
                filterExpressionsEnabled: false,
            },
            tools: [
                ...classicQueryTools,
                McpToolName.QUERY,
                McpToolName.GET_QUERY_RESULT,
            ],
            instructions: '4. `query`',
        },
    ])(
        'registers the query tools and instructions of the $name query path',
        async ({ queryPath, tools, instructions }) => {
            const mcpService = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await mcpService.createServer(makeMcpServerOptions({ queryPath }));
            expect(
                mockRegisteredMcpTools
                    .map(({ name }) => name)
                    .filter((name) =>
                        queryToolNames.some((toolName) => toolName === name),
                    ),
            ).toEqual(tools);
            expect(getLatestMcpServerInstructions()).toContain(instructions);
        },
    );

    it('points composer clients to the composer-querying skill first', async () => {
        const mcpService = makeMcpService();
        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({
                queryPath: {
                    type: 'composer',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: false,
                },
            }),
        );
        const query = mockRegisteredMcpTools.find(
            ({ name }) => name === McpToolName.QUERY,
        );
        expect(query?.config.description.split('\n')[0]).toBe(
            COMPOSER_QUERYING_SKILL_POINTER,
        );
        expect(getLatestMcpServerInstructions().split('\n')[0]).toBe(
            COMPOSER_QUERYING_SKILL_POINTER,
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

    describe('resolveQueryPath', () => {
        const PROJECT_UUID = 'project-a';
        const composerAgent = {
            enableDataAccess: true,
            enableComposerQueries: true,
        };
        const userWith = (
            canExplore: boolean,
            canRunSql: boolean,
        ): SessionUser => ({
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>([
                ...(canExplore
                    ? [
                          {
                              action: 'manage' as const,
                              subject: 'Explore' as const,
                          },
                      ]
                    : []),
                ...(canRunSql
                    ? [
                          {
                              action: 'manage' as const,
                              subject: 'SqlRunner' as const,
                          },
                      ]
                    : []),
            ]),
        });

        it.each<{
            name: string;
            canExplore: boolean;
            canRunSql: boolean;
            composeFlag: boolean;
            pinnedAgent: {
                enableDataAccess: boolean;
                enableComposerQueries: boolean;
            } | null;
            expected: McpQueryPath;
        }>([
            {
                name: 'no explore and no SQL Runner is content only',
                canExplore: false,
                canRunSql: false,
                composeFlag: true,
                pinnedAgent: null,
                expected: { type: 'contentOnly' },
            },
            {
                name: 'SQL Runner without explore is SQL only',
                canExplore: false,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: null,
                expected: { type: 'sqlOnly' },
            },
            {
                name: 'explore with the flag off is classic',
                canExplore: true,
                canRunSql: true,
                composeFlag: false,
                pinnedAgent: null,
                expected: {
                    type: 'classic',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'explore and SQL Runner with the flag on is composer with SQL Runner',
                canExplore: true,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: null,
                expected: {
                    type: 'composer',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'explore with the flag on is composer',
                canExplore: true,
                canRunSql: false,
                composeFlag: true,
                pinnedAgent: null,
                expected: {
                    type: 'composer',
                    sqlRunnerEnabled: false,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'a pinned agent with composer on is composer',
                canExplore: true,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: composerAgent,
                expected: {
                    type: 'composer',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'a pinned agent with composer on and the flag off is classic',
                canExplore: true,
                canRunSql: true,
                composeFlag: false,
                pinnedAgent: composerAgent,
                expected: {
                    type: 'classic',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'a pinned agent without explore is content only',
                canExplore: false,
                canRunSql: false,
                composeFlag: true,
                pinnedAgent: composerAgent,
                expected: { type: 'contentOnly' },
            },
            {
                name: 'a pinned agent with SQL Runner but no explore is SQL only',
                canExplore: false,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: composerAgent,
                expected: { type: 'sqlOnly' },
            },
            {
                name: 'a pinned agent with composer off is classic',
                canExplore: true,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: { ...composerAgent, enableComposerQueries: false },
                expected: {
                    type: 'classic',
                    sqlRunnerEnabled: true,
                    filterExpressionsEnabled: true,
                },
            },
            {
                name: 'a pinned agent with data access off is content only',
                canExplore: true,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: { ...composerAgent, enableDataAccess: false },
                expected: { type: 'contentOnly' },
            },
            {
                name: 'a pinned agent with data access off is content only with the flag off',
                canExplore: true,
                canRunSql: true,
                composeFlag: false,
                pinnedAgent: { ...composerAgent, enableDataAccess: false },
                expected: { type: 'contentOnly' },
            },
            {
                name: 'a pinned agent with data access off is content only for a SQL Runner user',
                canExplore: false,
                canRunSql: true,
                composeFlag: true,
                pinnedAgent: { ...composerAgent, enableDataAccess: false },
                expected: { type: 'contentOnly' },
            },
        ])(
            '$name',
            async ({
                canExplore,
                canRunSql,
                composeFlag,
                pinnedAgent,
                expected,
            }) => {
                const get = vi.fn(
                    async ({ featureFlagId }: { featureFlagId: string }) => ({
                        enabled:
                            featureFlagId === FeatureFlags.ComposeSqlRunner
                                ? composeFlag
                                : featureFlagId ===
                                  FeatureFlags.AiFilterExpressions,
                    }),
                );
                const service = makeMcpService(true, { get });
                const user = userWith(canExplore, canRunSql);
                await expect(
                    service.resolveQueryPath(user, null, pinnedAgent),
                ).resolves.toEqual(expected);
                await expect(
                    service.resolveQueryPath(user, PROJECT_UUID, pinnedAgent),
                ).resolves.toEqual(expected);
            },
        );
    });

    it('lists no query tools to a session pinned to an agent with data access off', async () => {
        const mcpService = makeMcpService(true, {
            get: vi.fn(async () => ({ enabled: true })),
        });
        const queryPath = await mcpService.resolveQueryPath(
            {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'Explore' },
                    { action: 'manage', subject: 'SqlRunner' },
                ]),
            },
            'project-a',
            { enableDataAccess: false, enableComposerQueries: true },
        );
        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(makeMcpServerOptions({ queryPath }));
        expect(
            mockRegisteredMcpTools
                .map(({ name }) => name)
                .filter((name) =>
                    queryToolNames.some((toolName) => toolName === name),
                ),
        ).toEqual([]);
        expect(getLatestMcpServerInstructions()).toContain(
            'Saved Content Mode',
        );
    });

    it('registers content and scheduled-delivery tools independently', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({
                mcpContentWritesEnabled: false,
                scheduledDeliveryEnabled: true,
            }),
        );
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
        await mcpService.createServer(
            makeMcpServerOptions({
                mcpContentWritesEnabled: true,
                scheduledDeliveryEnabled: false,
            }),
        );
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
        canAuthorContent: boolean;
        expected: boolean;
    }>([
        { settingEnabled: false, canAuthorContent: true, expected: false },
        { settingEnabled: true, canAuthorContent: false, expected: false },
        { settingEnabled: true, canAuthorContent: true, expected: true },
    ])(
        'gates MCP content tools by the setting and whether the user can save content',
        async ({ settingEnabled, canAuthorContent, expected }) => {
            const mcpService = makeMcpService(
                settingEnabled,
                undefined,
                canAuthorContent,
            );

            await expect(
                mcpService.isContentToolsEnabled(
                    defaultSessionUser,
                    'project-uuid',
                ),
            ).resolves.toBe(expected);
        },
    );

    it('checks the pinned project when deciding whether content tools are offered', async () => {
        const mcpService = makeMcpService();
        await mcpService.isContentToolsEnabled(
            defaultSessionUser,
            'project-uuid',
        );
        expect(
            mcpService['aiAgentToolsService'].canAuthorContent,
        ).toHaveBeenCalledWith({
            user: defaultSessionUser,
            projectUuid: 'project-uuid',
            spaceUuids: null,
        });
    });
});
