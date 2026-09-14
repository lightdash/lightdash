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
import { MCP_FILTER_EXPRESSION_GUIDANCE_SECTION } from '../ai/prompts/filterGuidance';
import {
    getMcpAnalystPrompt,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { BuiltInSkills } from '../ai/skills/builtInSkills';
import {
    isProjectScopedMcpTool,
    McpService,
    McpToolName,
    type McpServerToolOptions,
} from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

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
const mockMcpServerInstructions: Array<string | undefined> = [];
const mockRegisteredMcpResourceUris: string[] = [];

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
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
        aiAgentToolsService: {
            createRuntime: vi.fn(),
            listMcpSkillResources: () => BuiltInSkills.listMcpResources(),
            getMcpSkillResourceBody: (uri: string) =>
                BuiltInSkills.getMcpResourceBody(uri),
        },
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

const defaultMcpAnalystPromptOptions = {
    runSqlEnabled: true,
    runMetricQueryEnabled: true,
    filterExpressionsEnabled: false,
};

// Observed in Claude Code 2.1.263; this is not an MCP protocol limit.
const MCP_CLIENT_TEXT_MAX_CHARS = 2048;

// Classify new features explicitly: registration-only or text-changing.
const registrationOnlyFeatures = {
    mcpContentWritesEnabled: true,
    scheduledDeliveryEnabled: true,
} satisfies Omit<
    McpServerToolOptions['featureAvailability'],
    keyof typeof defaultMcpAnalystPromptOptions
>;
const mcpOptionCombinations = Object.keys(
    defaultMcpAnalystPromptOptions,
).reduce(
    (combinations, key) =>
        combinations.flatMap((options) =>
            [false, true].map((enabled) => ({ ...options, [key]: enabled })),
        ),
    [defaultMcpAnalystPromptOptions],
);

const mcpTextConfigurations = mcpOptionCombinations.map((options) => ({
    ...registrationOnlyFeatures,
    ...options,
}));
const warnedInstructionLengths = new Set<number>();

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
                runSqlEnabled: false,
            }),
        ).not.toContain(guidance);
    });

    it('matches initialization guidance to the filter contract', async () => {
        const mcpService = makeMcpService();

        await mcpService.createServer(
            makeMcpServerOptions({
                runMetricQueryEnabled: true,
                filterExpressionsEnabled: false,
            }),
        );
        expect(getLatestMcpServerInstructions()).not.toContain(
            MCP_FILTER_EXPRESSION_GUIDANCE_SECTION,
        );

        await mcpService.createServer(
            makeMcpServerOptions({
                runMetricQueryEnabled: true,
                filterExpressionsEnabled: true,
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
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
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

    it.each([
        {
            name: 'structured-filter',
            filterExpressionsEnabled: false,
        },
        {
            name: 'filter-expression',
            filterExpressionsEnabled: true,
        },
    ])(
        'matches the $name MCP server instructions snapshot',
        async ({ filterExpressionsEnabled }) => {
            const mcpService = makeMcpService();

            await mcpService.createServer(
                makeMcpServerOptions({
                    runSqlEnabled: true,
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
                }),
            );

            expect(getLatestMcpServerInstructions()).toMatchSnapshot();
        },
    );

    it('covers every instruction/filter configuration exactly once', () => {
        const expectedCount =
            2 ** Object.keys(defaultMcpAnalystPromptOptions).length;
        expect(mcpOptionCombinations).toHaveLength(expectedCount);
        expect(
            new Set(
                mcpOptionCombinations.map((options) => JSON.stringify(options)),
            ).size,
        ).toBe(expectedCount);
    });

    it.each(mcpTextConfigurations)(
        `keeps registered MCP tool descriptions within ${MCP_CLIENT_TEXT_MAX_CHARS} chars: sql=$runSqlEnabled metric=$runMetricQueryEnabled expressions=$filterExpressionsEnabled`,
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
                expect
                    .soft(
                        length,
                        `${configuration}: ${name} is ${length} chars, exceeding ${MCP_CLIENT_TEXT_MAX_CHARS}; shorten the text instead of updating snapshots`,
                    )
                    .toBeLessThanOrEqual(MCP_CLIENT_TEXT_MAX_CHARS);
            });
        },
    );

    it.each(mcpTextConfigurations)(
        'keeps pagination guidance on registered input fields: sql=$runSqlEnabled metric=$runMetricQueryEnabled expressions=$filterExpressionsEnabled',
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
        'ratchets MCP server instruction lengths: sql=$runSqlEnabled metric=$runMetricQueryEnabled expressions=$filterExpressionsEnabled',
        async (options) => {
            const configuration = JSON.stringify(options);
            const mcpService = makeMcpService();
            await mcpService.createServer(makeMcpServerOptions(options));
            // Existing instruction overages cannot grow; lower these as text shrinks.
            const instructionCeilings = options.runSqlEnabled
                ? { structured: 2622, expression: 2759 }
                : { structured: 1825, expression: 1962 };
            const instructionCeiling = options.runMetricQueryEnabled
                ? instructionCeilings[
                      options.filterExpressionsEnabled
                          ? 'expression'
                          : 'structured'
                  ]
                : MCP_CLIENT_TEXT_MAX_CHARS;
            const { length } = getLatestMcpServerInstructions();

            if (
                length > MCP_CLIENT_TEXT_MAX_CHARS &&
                !warnedInstructionLengths.has(length)
            ) {
                // Report a distinct length once, while asserting every combination.
                warnedInstructionLengths.add(length);
                process.stderr.write(
                    `[MCP client text limit: ${configuration}]\nserver instructions: ${length} chars (+${length - MCP_CLIENT_TEXT_MAX_CHARS} over ${MCP_CLIENT_TEXT_MAX_CHARS})\n`,
                );
            }
            expect(
                length,
                `${configuration}: server instructions exceed their text ceiling; shorten the text instead of updating snapshots`,
            ).toBeLessThanOrEqual(instructionCeiling);
        },
    );

    it.each([false, true])(
        'keeps workflow details on their registered tools: expressions=%s',
        async (filterExpressionsEnabled) => {
            const service = makeMcpService();
            mockRegisteredMcpTools.length = 0;
            await service.createServer(
                makeMcpServerOptions({
                    runSqlEnabled: true,
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
                }),
            );
            const guidance = [
                {
                    name: McpToolName.RUN_METRIC_QUERY,
                    details: [
                        'If the user mentions any time period, add an explicit date filter; never use sort + limit instead.',
                        'Use inThePast for relative windows.',
                        'Date fields from joined tables work identically in filters.',
                    ],
                },
                {
                    name: McpToolName.GREP_FIELDS,
                    details: [
                        '1–5 patterns in a SINGLE call',
                        'long natural-language phrases',
                        'right grain',
                    ],
                },
                {
                    name: McpToolName.GET_METADATA,
                    details: [
                        'required filters',
                        'filter type, case-sensitivity',
                        'batch everything you need at once',
                    ],
                },
                {
                    name: McpToolName.GET_CONTEXT,
                    details: [
                        'use route_agent',
                        'returned agentUuid explicitly',
                        'omit agentUuid; use set_agent for manual selection',
                    ],
                },
                {
                    name: McpToolName.SEARCH_FIELD_VALUES,
                    details: [
                        'dimension before building a filter',
                        'use it directly instead of searching',
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
                    details: ['direct children and content inside that space'],
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
                for (const detail of details) {
                    expect(tool?.config.description).toContain(detail);
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
                    runSqlEnabled: true,
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
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
                    runSqlEnabled: true,
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
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
                    runSqlEnabled: true,
                    runMetricQueryEnabled: true,
                    filterExpressionsEnabled,
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
                runSqlEnabled: true,
                runMetricQueryEnabled: true,
            }),
        );

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
        await mcpService.createServer(
            makeMcpServerOptions({
                runSqlEnabled: false,
                runMetricQueryEnabled: false,
            }),
        );

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
        await mcpService.createServer(
            makeMcpServerOptions({
                runSqlEnabled: true,
                runMetricQueryEnabled: false,
            }),
        );

        const registeredNames = mockRegisteredMcpTools.map(({ name }) => name);
        expect(registeredNames).toContain(McpToolName.RUN_SQL);
        expect(registeredNames).toContain(McpToolName.GET_QUERY_RESULT);
        expect(registeredNames).not.toContain(McpToolName.RENDER_CHART);
        expect(registeredNames).not.toContain(McpToolName.RUN_METRIC_QUERY);
    });

    it('matches the filter-expression run_metric_query tools/list snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({
                runMetricQueryEnabled: true,
                filterExpressionsEnabled: true,
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
                runMetricQueryEnabled: true,
                filterExpressionsEnabled: true,
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
            expect(names.includes(McpToolName.SET_PROJECT)).toBe(
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
                runSqlEnabled: true,
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

    it('registers run_sql only when runSqlEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({ runSqlEnabled: true }),
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.RUN_SQL,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({ runSqlEnabled: false }),
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.RUN_SQL,
        );
    });

    it('registers run_metric_query only when runMetricQueryEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({ runMetricQueryEnabled: true }),
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.RUN_METRIC_QUERY,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer(
            makeMcpServerOptions({ runMetricQueryEnabled: false }),
        );
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
