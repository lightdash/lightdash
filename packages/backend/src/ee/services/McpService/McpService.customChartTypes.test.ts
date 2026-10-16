import {
    ForbiddenError,
    mcpFindCustomChartTypesOutputSchema,
    mcpListCustomChartTypesOutputSchema,
    type McpCustomChartType,
} from '@lightdash/common';
import { z } from 'zod';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();
const mockRegisteredInputShapes = new Map<string, z.ZodRawShape>();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
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
                registerPrompt: vi.fn(),
                registerTool: vi.fn(
                    (
                        name: string,
                        config: { inputSchema: z.ZodRawShape },
                        callback: RegisteredToolCallback,
                    ) => {
                        mockRegisteredMcpTools.set(name, callback);
                        mockRegisteredInputShapes.set(name, config.inputSchema);
                        return {};
                    },
                ),
            };
        },
    ),
}));

const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';
const projectUuid = 'project-uuid';

const makeExtra = () => ({
    signal: new AbortController().signal,
    requestId: 'request-id',
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    authInfo: {
        extra: {
            user: {
                userUuid,
                organizationUuid,
                ability: {
                    can: vi.fn(() => true),
                    cannot: vi.fn(() => false),
                    relevantRuleFor: vi.fn(() => ({ inverted: false })),
                    rules: [],
                },
            },
            account: {
                isRegisteredUser: () => true,
                isServiceAccount: () => false,
                authentication: { type: 'pat' },
                user: { id: userUuid },
                organization: { organizationUuid },
            },
        },
    },
});

const sankey: McpCustomChartType = {
    slug: 'sankey-flow',
    name: 'Sankey Flow',
    description: null,
    version: 3,
    chartStudioUrl: `https://lightdash.example/projects/${projectUuid}/chart-studio/sankey-flow`,
    vizSchema: {
        fields: [
            {
                name: 'source',
                label: 'Source',
                type: 'dimension',
                required: true,
                multiple: false,
                description: null,
            },
        ],
        configOptions: [
            {
                name: 'curved',
                label: 'Curved links',
                type: 'boolean',
                group: null,
                default: true,
                choices: null,
                min: null,
                max: null,
            },
        ],
        colorPalette: null,
        hierarchy: null,
        inputGuidance: null,
    },
};

const createServer = async (
    searchCustomChartTypes: ReturnType<typeof vi.fn>,
    customChartTypesEnabled = true,
    listCustomChartTypesPage: ReturnType<typeof vi.fn> = vi.fn(),
) => {
    const mcpService = new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiAgentToolsService: {
            createRuntime: () => ({
                searchCustomChartTypes,
                listCustomChartTypesPage,
            }),
        },
        analytics: { track: vi.fn() },
        featureFlagService: {},
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: { getContext: vi.fn().mockResolvedValue(undefined) },
        mcpToolCallModel: {
            createToolCall: vi.fn(),
            findClientInfo: vi.fn(),
        },
        projectService: {
            getProject: vi.fn().mockResolvedValue({ organizationUuid }),
        },
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    mockRegisteredMcpTools.clear();
    mockRegisteredInputShapes.clear();
    await mcpService.createServer(
        makeMcpServerOptions({ customChartTypesEnabled }),
    );
};

const callFind = (args: Record<string, unknown>) => {
    const callback = mockRegisteredMcpTools.get(
        McpToolName.FIND_CUSTOM_CHART_TYPES,
    );
    if (!callback) throw new Error('find_custom_chart_types not registered');
    return callback({ projectUuid, ...args }, makeExtra());
};

describe('McpService find_custom_chart_types', () => {
    it('registers the tool only when custom chart types are available', async () => {
        await createServer(vi.fn(), true);
        expect(
            mockRegisteredMcpTools.has(McpToolName.FIND_CUSTOM_CHART_TYPES),
        ).toBe(true);

        await createServer(vi.fn(), false);
        expect(
            mockRegisteredMcpTools.has(McpToolName.FIND_CUSTOM_CHART_TYPES),
        ).toBe(false);
    });

    it('searches by query and returns structured matches', async () => {
        const search = vi.fn().mockResolvedValue([sankey]);
        await createServer(search);

        const result = await callFind({ query: ' sankey ', slug: null });

        expect(search).toHaveBeenCalledWith({ query: 'sankey' });
        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toEqual({ results: [sankey] });
        expect(
            mcpFindCustomChartTypesOutputSchema.safeParse(
                result.structuredContent,
            ).success,
        ).toBe(true);
        const [{ text }] = result.content as Array<{ text: string }>;
        expect(text).toContain('Sankey Flow (sankey-flow)');
        expect(Object.keys(sankey)).toEqual([
            'slug',
            'name',
            'description',
            'version',
            'chartStudioUrl',
            'vizSchema',
        ]);
    });

    it('fetches one chart type by slug', async () => {
        const search = vi.fn().mockResolvedValue([]);
        await createServer(search);

        const result = await callFind({ slug: 'missing' });

        expect(search).toHaveBeenCalledWith({ slug: 'missing' });
        expect(result.structuredContent).toEqual({ results: [] });
        const [{ text }] = result.content as Array<{ text: string }>;
        expect(text).toBe('No custom chart type matched slug "missing".');
    });

    it.each([
        { name: 'neither', args: {} },
        { name: 'both', args: { query: 'sankey', slug: 'sankey-flow' } },
        { name: 'blank', args: { query: '  ', slug: null } },
    ])('rejects $name of query and slug', async ({ args }) => {
        const search = vi.fn();
        await createServer(search);

        const result = await callFind(args);

        expect(result.isError).toBe(true);
        expect(search).not.toHaveBeenCalled();
    });

    it('surfaces a refused caller as a tool error', async () => {
        await createServer(
            vi
                .fn()
                .mockRejectedValue(
                    new ForbiddenError(
                        'You do not have permission to use chart types in this project',
                    ),
                ),
        );

        const result = await callFind({ query: 'sankey' });

        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                type: 'text',
                text: 'You do not have permission to use chart types in this project',
            },
        ]);
    });
});

const callList = (args: Record<string, unknown>) => {
    const callback = mockRegisteredMcpTools.get(
        McpToolName.LIST_CUSTOM_CHART_TYPES,
    );
    if (!callback) throw new Error('list_custom_chart_types not registered');
    return callback({ projectUuid, ...args }, makeExtra());
};

const parseListInput = (args: Record<string, unknown>) => {
    const shape = mockRegisteredInputShapes.get(
        McpToolName.LIST_CUSTOM_CHART_TYPES,
    );
    if (!shape) throw new Error('list_custom_chart_types not registered');
    return z.object({ page: shape.page }).safeParse(args);
};

describe('McpService list_custom_chart_types', () => {
    const pageOne = {
        pagination: {
            page: 1,
            pageSize: 10,
            totalResults: 11,
            totalPageCount: 2,
        },
        results: [sankey],
    };

    it('registers the tool only when custom chart types are available', async () => {
        await createServer(vi.fn(), true);
        expect(
            mockRegisteredMcpTools.has(McpToolName.LIST_CUSTOM_CHART_TYPES),
        ).toBe(true);

        await createServer(vi.fn(), false);
        expect(
            mockRegisteredMcpTools.has(McpToolName.LIST_CUSTOM_CHART_TYPES),
        ).toBe(false);
    });

    it('defaults to the first page and returns structured items with pagination', async () => {
        const list = vi.fn().mockResolvedValue(pageOne);
        await createServer(vi.fn(), true, list);

        const parsed = parseListInput({});
        expect(parsed.success).toBe(true);
        const result = await callList(parsed.success ? parsed.data : {});

        expect(list).toHaveBeenCalledWith({ page: 1 });
        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toEqual(pageOne);
        expect(
            mcpListCustomChartTypesOutputSchema.safeParse(
                result.structuredContent,
            ).success,
        ).toBe(true);
        const [{ text }] = result.content as Array<{ text: string }>;
        expect(text).toContain('Page 1 of 2 (11 custom chart types)');
        expect(text).toContain('Sankey Flow (sankey-flow)');
    });

    it('passes the requested page to the runtime', async () => {
        const list = vi.fn().mockResolvedValue({
            pagination: { ...pageOne.pagination, page: 3 },
            results: [],
        });
        await createServer(vi.fn(), true, list);

        const parsed = parseListInput({ page: '3' });
        expect(parsed.success).toBe(true);
        const result = await callList(parsed.success ? parsed.data : {});

        expect(list).toHaveBeenCalledWith({ page: 3 });
        const [{ text }] = result.content as Array<{ text: string }>;
        expect(text).toBe('No custom chart types on page 3 of 2.');
    });

    it.each([0, -1, 'abc'])(
        'rejects page %s as invalid input',
        async (page) => {
            await createServer(vi.fn(), true);

            expect(parseListInput({ page }).success).toBe(false);
        },
    );

    it('surfaces a refused caller as a tool error', async () => {
        await createServer(
            vi.fn(),
            true,
            vi
                .fn()
                .mockRejectedValue(
                    new ForbiddenError(
                        'You do not have permission to use chart types in this project',
                    ),
                ),
        );

        const result = await callList({ page: 1 });

        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                type: 'text',
                text: 'You do not have permission to use chart types in this project',
            },
        ]);
    });
});
